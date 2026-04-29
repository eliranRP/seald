import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import forge from 'node-forge';
import type { CertWithMetadata } from './cert-chain-extractor';

/**
 * Best-effort fetcher for revocation material (OCSP responses + CRLs)
 * needed to upgrade a PAdES B-T signature to PAdES B-LT. All outbound
 * fetches are bounded by a 10-second AbortSignal timeout — these are
 * external services whose latency is outside our control, and a flaky
 * responder must NEVER hang the sealing worker.
 *
 * Failure handling: every method returns `null` on any error (transport,
 * timeout, malformed response). The DSS injector treats `null` as "no
 * material available for this cert" and proceeds without it. The seal
 * still succeeds at B-T; it just won't have that responder's data
 * embedded for long-term validation.
 */
@Injectable()
export class RevocationFetcher {
  private readonly logger = new Logger(RevocationFetcher.name);
  private static readonly FETCH_TIMEOUT_MS = 10_000;

  /**
   * Fetch an OCSP response for `cert`, signed by `issuer`. Constructs an
   * RFC 6960 OCSPRequest with a single CertID (issuerNameHash +
   * issuerKeyHash + serialNumber, all SHA-1 per the RFC default) and
   * POSTs to the first AIA OCSP URL. Returns the DER bytes of the
   * complete OCSPResponse (not just BasicOCSPResponse) so the verifier
   * gets the status wrapper too.
   */
  async fetchOcsp(cert: CertWithMetadata, issuer: CertWithMetadata): Promise<Buffer | null> {
    const url = cert.ocspUrls[0];
    if (!url) return null;

    let reqDer: Buffer;
    try {
      reqDer = buildOcspRequest(cert, issuer);
    } catch (err) {
      this.logger.warn(
        `OCSP request build failed for ${cert.subjectDn}: ${(err as Error).message}`,
      );
      return null;
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/ocsp-request' },
        body: new Uint8Array(reqDer),
        signal: AbortSignal.timeout(RevocationFetcher.FETCH_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(`OCSP fetch ${url} -> HTTP ${res.status}`);
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      // Sanity check — OCSPResponse always parses as a SEQUENCE.
      try {
        forge.asn1.fromDer(buf.toString('binary'));
      } catch {
        return null;
      }
      return buf;
    } catch (err) {
      const e = err as Error;
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        this.logger.warn(`OCSP fetch ${url} timed out`);
      } else {
        this.logger.warn(`OCSP fetch ${url} failed: ${e.message}`);
      }
      return null;
    }
  }

  /**
   * Fetch the CRL from the first reachable distribution point. CRLs are
   * served as a plain HTTP GET; the response body is the DER bytes of
   * the CertificateList structure. We try each DP URL in order, stopping
   * at the first success.
   */
  async fetchCrl(cert: CertWithMetadata): Promise<Buffer | null> {
    for (const url of cert.crlUrls) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: AbortSignal.timeout(RevocationFetcher.FETCH_TIMEOUT_MS),
        });
        if (!res.ok) continue;
        const buf = Buffer.from(await res.arrayBuffer());
        // Some CAs serve CRLs as PEM. Convert to DER if so.
        const der = pemToDerIfNeeded(buf);
        try {
          forge.asn1.fromDer(der.toString('binary'));
        } catch {
          continue;
        }
        return der;
      } catch (err) {
        const e = err as Error;
        if (e.name === 'TimeoutError' || e.name === 'AbortError') {
          this.logger.warn(`CRL fetch ${url} timed out`);
        } else {
          this.logger.warn(`CRL fetch ${url} failed: ${e.message}`);
        }
        // Continue to next DP.
      }
    }
    return null;
  }
}

const asn1 = forge.asn1;

/**
 * RFC 6960 §4.1.1 — build a basic OCSPRequest containing one CertID.
 *
 *   OCSPRequest ::= SEQUENCE { tbsRequest TBSRequest, optionalSignature OPTIONAL }
 *   TBSRequest  ::= SEQUENCE { version [0] EXPLICIT default v1,
 *                              requestorName [1] OPTIONAL,
 *                              requestList SEQUENCE OF Request,
 *                              ... }
 *   Request     ::= SEQUENCE { reqCert CertID, singleRequestExtensions OPTIONAL }
 *   CertID      ::= SEQUENCE { hashAlgorithm AlgorithmIdentifier,
 *                              issuerNameHash OCTET STRING,
 *                              issuerKeyHash OCTET STRING,
 *                              serialNumber INTEGER }
 *
 * We use SHA-1 for the CertID hashes (the RFC default — every responder
 * supports it). The serial number is taken verbatim from the cert.
 */
function buildOcspRequest(cert: CertWithMetadata, issuer: CertWithMetadata): Buffer {
  const issuerCert = forge.pki.certificateFromAsn1(asn1.fromDer(issuer.der.toString('binary')));
  // issuerNameHash = SHA-1 over the DER encoding of the issuer's Name
  // (which equals issuer.subject from the issuer's own cert).
  const issuerNameDer = asn1
    .toDer(forge.pki.distinguishedNameToAsn1(issuerCert.subject))
    .getBytes();
  const issuerNameHash = createHash('sha1').update(Buffer.from(issuerNameDer, 'binary')).digest();
  // issuerKeyHash = SHA-1 over the BIT STRING value (without the unused-bits
  // octet) of the issuer's SubjectPublicKeyInfo. forge gives us the public
  // key — re-encode SPKI and dig out the BIT STRING value.
  const spki = forge.pki.publicKeyToAsn1(issuerCert.publicKey);
  // SPKI ::= SEQUENCE { algorithm, subjectPublicKey BIT STRING }
  const spkiSeq = (spki as forge.asn1.Asn1).value as forge.asn1.Asn1[];
  const bitString = spkiSeq[1]! as forge.asn1.Asn1;
  // node-forge BIT STRING value is a raw byte string; first byte = unused-bits count.
  const bsRaw = bitString.value as unknown as string;
  const keyBytes = bsRaw.length > 0 ? bsRaw.slice(1) : '';
  const issuerKeyHash = createHash('sha1').update(Buffer.from(keyBytes, 'binary')).digest();

  // Serial number: forge stores it as a hex string.
  const serialHex = cert.serialHex;
  const serialBytes = forge.util.hexToBytes(
    serialHex.length % 2 === 0 ? serialHex : `0${serialHex}`,
  );

  const certId = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    // hashAlgorithm: SHA-1 with NULL parameters (1.3.14.3.2.26)
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(
        asn1.Class.UNIVERSAL,
        asn1.Type.OID,
        false,
        asn1.oidToDer('1.3.14.3.2.26').getBytes(),
      ),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      issuerNameHash.toString('binary'),
    ),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      issuerKeyHash.toString('binary'),
    ),
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, serialBytes),
  ]);

  const request = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    certId,
    // No singleRequestExtensions.
  ]);
  const requestList = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [request]);
  const tbsRequest = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [requestList]);
  const ocspRequest = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [tbsRequest]);

  return Buffer.from(asn1.toDer(ocspRequest).getBytes(), 'binary');
}

function pemToDerIfNeeded(buf: Buffer): Buffer {
  const head = buf.slice(0, 32).toString('utf8');
  if (head.startsWith('-----BEGIN')) {
    const text = buf.toString('utf8');
    const m = /-----BEGIN [^-]+-----([\s\S]*?)-----END [^-]+-----/.exec(text);
    if (m && m[1]) {
      return Buffer.from(m[1].replace(/\s+/g, ''), 'base64');
    }
  }
  return buf;
}
