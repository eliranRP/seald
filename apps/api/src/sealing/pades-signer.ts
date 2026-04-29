import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import type { AppEnv } from '../config/env.schema';
import { P12TsaSigner } from './p12-tsa-signer';
import type { TsaClient } from './tsa-client';

/**
 * Port for applying a PAdES (PDF Advanced Electronic Signatures) signature
 * to a burned-in PDF. Two implementations:
 *
 *   P12PadesSigner — the real deal. Reads a PKCS#12 keypair from disk,
 *     injects a signature placeholder into the PDF, and signs with CMS
 *     (detached PKCS#7). The result has a /Sig dictionary that Adobe
 *     Reader, preview tools, and PDF verifiers will recognise.
 *
 *   NoopPadesSigner — passthrough. Used when PDF_SIGNING_LOCAL_P12_PATH
 *     is absent (e.g. test environments, pre-provisioning). The sealed
 *     PDF still has the burn-in + a sha256; just no crypto chain.
 *
 * Selection happens in SealingModule via the PADES_SIGNER factory
 * provider — at runtime it picks based on env presence.
 */
@Injectable()
export abstract class PadesSigner {
  abstract sign(pdf: Buffer): Promise<Buffer>;
}

@Injectable()
export class NoopPadesSigner extends PadesSigner {
  async sign(pdf: Buffer): Promise<Buffer> {
    // Intentional passthrough. See class comment on PadesSigner for why.
    return pdf;
  }
}

/**
 * Reads a P12 keypair at construction time (fail fast on bad config) and
 * caches the buffer + password. Each `sign()` call adds a signature
 * placeholder via @signpdf/placeholder-plain and hands the PDF to
 * SignPdf + P12Signer for CMS detached signing.
 *
 * Notes on the placeholder step:
 *   - The PDF must NOT already contain a signed /AcroForm; pdf-lib's
 *     output is a plain PDF so this holds.
 *   - signatureLength reserves bytes in /Contents for the eventual
 *     PKCS#7 blob. 16384 is generous enough for a sha256 signature with
 *     a small chain + (eventually) a timestamp token.
 */
@Injectable()
export class P12PadesSigner extends PadesSigner {
  private readonly logger = new Logger(P12PadesSigner.name);
  private readonly p12Bytes: Buffer;
  private readonly passphrase: string;
  private readonly tsa: TsaClient | null;

  // Instantiated via useFactory in SealingModule, not via Nest DI —
  // hence no @Inject() decorator here.
  constructor(env: AppEnv, tsa: TsaClient | null) {
    super();
    const path = env.PDF_SIGNING_LOCAL_P12_PATH;
    const pass = env.PDF_SIGNING_LOCAL_P12_PASS;
    if (!path || !pass) {
      throw new Error(
        'P12PadesSigner requires PDF_SIGNING_LOCAL_P12_PATH + PDF_SIGNING_LOCAL_P12_PASS',
      );
    }
    try {
      this.p12Bytes = readFileSync(path);
    } catch (err) {
      throw new Error(
        `P12PadesSigner: cannot read P12 at ${path}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    this.passphrase = pass;
    this.tsa = tsa;
    this.logger.log(
      `P12 keypair loaded from ${path} (${this.p12Bytes.length} bytes); TSA ${this.tsa ? 'enabled' : 'disabled'}`,
    );
  }

  async sign(pdf: Buffer): Promise<Buffer> {
    // SECURITY NOTE — visible signature appearances:
    // The signatures we currently produce are INVISIBLE (no widget rendered
    // on the page; only a /Sig dictionary). The `name: 'Seald'` below feeds
    // the /Sig dictionary's /Name entry, which Adobe Reader displays as a
    // text label in the signature panel — informational only, not a
    // visible-on-page appearance.
    //
    // If/when visible signature appearances are added (drawing the signer's
    // identity onto the page itself), the displayed name MUST be derived
    // from the signing certificate's Subject CN — never from user-supplied
    // input. A visible appearance that lies about who signed is a UX-level
    // trust spoofing attack: a viewer believes "Alice signed this" when
    // really Bob's key signed it but the appearance carried Alice's name.
    // See esignature-standards-expert §2.3 (signer identity binding) and
    // §13.9 (visible appearance integrity) before extending this path.
    const withPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdf,
      reason: 'Signed and sealed by Seald',
      contactInfo: 'seald',
      name: 'Seald',
      location: 'Seald',
      // 16 KB handles sha256 + cert chain + TSA TST comfortably.
      signatureLength: 16384,
      // Override the @signpdf default ('adbe.pkcs7.detached', a legacy CMS
      // marker that does NOT signal PAdES conformance) with the ETSI
      // subfilter that PAdES baseline B-B/B-T mandates. Verifiers like
      // EU DSS key off this string to even attempt PAdES validation.
      // (esignature-standards-expert §3.2; cryptography-expert §11.4.)
      subFilter: 'ETSI.CAdES.detached',
    });

    // With TSA → PAdES-B-T (full cryptographic chain-of-custody including
    // trusted time attestation). Without TSA → PAdES-B-B (signature only).
    // Production deploys MUST configure PDF_SIGNING_TSA_URL.
    const signer = this.tsa
      ? new P12TsaSigner(this.p12Bytes, this.passphrase, this.tsa)
      : new P12Signer(this.p12Bytes, { passphrase: this.passphrase });
    const signed = await new SignPdf().sign(withPlaceholder, signer);
    return signed;
  }
}
