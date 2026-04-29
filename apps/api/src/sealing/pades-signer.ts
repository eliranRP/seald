import { readFileSync } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { KMSClient } from '@aws-sdk/client-kms';
import { plainAddPlaceholder } from '@signpdf/placeholder-plain';
import { P12Signer } from '@signpdf/signer-p12';
import { SignPdf } from '@signpdf/signpdf';
import forge from 'node-forge';
import type { AppEnv } from '../config/env.schema';
import { KmsCmsSigner } from './kms-cms-signer';
import { P12TsaSigner } from './p12-tsa-signer';
import type { TsaClient } from './tsa-client';

/**
 * Port for applying a PAdES (PDF Advanced Electronic Signatures) signature
 * to a burned-in PDF. Three implementations:
 *
 *   KmsPadesSigner — production path. The signing key lives only in AWS
 *     KMS; this process never sees the private key bytes. Each seal calls
 *     KMS Sign for a SHA-256 digest. Pairs with an X.509 cert (PEM) that
 *     binds the KMS public key to the signer identity. F-1 / F-8 of the
 *     PAdES due-diligence remediation.
 *
 *   P12PadesSigner — legacy / dev path. Reads a PKCS#12 keypair from disk,
 *     injects a signature placeholder into the PDF, and signs with CMS
 *     (detached PKCS#7). Kept for local development and the e2e harness
 *     (which generates a throwaway P12 with openssl); will be removed in
 *     a follow-up commit once the KMS path is fully exercised in CI.
 *
 *   NoopPadesSigner — passthrough. Used when neither provider is
 *     configured (e.g. a freshly-cloned dev environment, pre-provisioning
 *     image). The sealed PDF still has the burn-in + a sha256; just no
 *     crypto chain.
 *
 * Selection happens in SealingModule via the PadesSigner factory provider
 * — at runtime it picks based on PDF_SIGNING_PROVIDER + env presence.
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

/**
 * AWS KMS-backed PAdES signer. The keypair lives in KMS (asymmetric
 * SIGN_VERIFY, RSA_3072) — this process holds only the public-side
 * X.509 cert that binds the KMS public key to the signer identity.
 * Per `sign()`:
 *
 *   1. Inject a /Contents placeholder via @signpdf/placeholder-plain
 *      with the same `ETSI.CAdES.detached` subFilter as the P12 path.
 *   2. Hand off to SignPdf + KmsCmsSigner — the latter builds the CMS
 *      SignedData by hand and delegates the signature operation to
 *      KMS over the SHA-256 of DER-encoded SignedAttributes.
 *
 * F-1 / F-8 of the PAdES due-diligence remediation (cryptography-expert
 * §8 — production keys go in HSM-backed KMS, not on local disk).
 */
@Injectable()
export class KmsPadesSigner extends PadesSigner {
  private readonly logger = new Logger(KmsPadesSigner.name);
  private readonly kmsClient: KMSClient;
  private readonly keyId: string;
  private readonly certificate: forge.pki.Certificate;
  private readonly tsa: TsaClient | null;

  constructor(env: AppEnv, tsa: TsaClient | null) {
    super();
    if (!env.PDF_SIGNING_KMS_KEY_ID || !env.PDF_SIGNING_KMS_REGION) {
      throw new Error('KmsPadesSigner requires PDF_SIGNING_KMS_KEY_ID + PDF_SIGNING_KMS_REGION');
    }
    const pem = resolveKmsCertPem(env);
    if (!pem) {
      throw new Error(
        'KmsPadesSigner requires PDF_SIGNING_KMS_CERT_PEM or PDF_SIGNING_KMS_CERT_PEM_PATH',
      );
    }
    this.kmsClient = new KMSClient({ region: env.PDF_SIGNING_KMS_REGION });
    this.keyId = env.PDF_SIGNING_KMS_KEY_ID;
    this.certificate = forge.pki.certificateFromPem(pem);
    this.tsa = tsa;
    const subjectCn = this.certificate.subject.getField('CN')?.value ?? '(no CN)';
    this.logger.log(
      `KMS signer ready: key=${this.keyId} region=${env.PDF_SIGNING_KMS_REGION} subject="${String(subjectCn)}" TSA=${this.tsa ? 'enabled' : 'disabled'}`,
    );
  }

  async sign(pdf: Buffer): Promise<Buffer> {
    const withPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdf,
      reason: 'Signed and sealed by Seald',
      contactInfo: 'seald',
      name: 'Seald',
      location: 'Seald',
      signatureLength: 16384,
      // Same PAdES subFilter as the P12 path — verifiers (EU DSS, Adobe
      // Reader) key off this string to attempt PAdES validation.
      subFilter: 'ETSI.CAdES.detached',
    });

    const cmsSigner = new KmsCmsSigner(this.kmsClient, this.keyId, this.certificate, this.tsa);
    return await new SignPdf().sign(withPlaceholder, cmsSigner);
  }
}

/**
 * Resolve the binding cert. Inline PEM (PDF_SIGNING_KMS_CERT_PEM) wins
 * over the on-disk path. Returns null if neither is set so the caller
 * surfaces a precise error.
 */
function resolveKmsCertPem(env: AppEnv): string | null {
  if (env.PDF_SIGNING_KMS_CERT_PEM && env.PDF_SIGNING_KMS_CERT_PEM.length > 0) {
    return env.PDF_SIGNING_KMS_CERT_PEM;
  }
  if (env.PDF_SIGNING_KMS_CERT_PEM_PATH && env.PDF_SIGNING_KMS_CERT_PEM_PATH.length > 0) {
    try {
      return readFileSync(env.PDF_SIGNING_KMS_CERT_PEM_PATH, 'utf8');
    } catch (err) {
      throw new Error(
        `KmsPadesSigner: cannot read cert PEM at ${env.PDF_SIGNING_KMS_CERT_PEM_PATH}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return null;
}
