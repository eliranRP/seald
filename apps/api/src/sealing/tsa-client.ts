import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import forge from 'node-forge';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

/** TSA round-trip timeout (rule 9.3). Above this we bail and fall through to
 *  PAdES-B-B; sealing must not block on a flaky upstream timestamp authority. */
const TSA_FETCH_TIMEOUT_MS = 10_000;

/**
 * RFC 3161 Time-Stamp Authority client. Given the hash of a blob (typically
 * a PAdES signature's encryptedDigest, but really any bytes), fetches a
 * TimeStampToken (TST) from the configured TSA.
 *
 * The TST is itself a CMS SignedData structure. A verifier can later parse
 * it, confirm the TSA's chain, extract `genTime`, and assert that the
 * messageImprint matches the hash of the blob — proving the blob existed
 * at that time.
 *
 * The TST is embedded INLINE in the PDF signature. Specifically, after the
 * TSA grants a token, `P12TsaSigner` (apps/api/src/sealing/p12-tsa-signer.ts)
 * walks the produced CMS SignedData ASN.1 tree and attaches the token as
 * `id-aa-signatureTimeStampToken` (OID 1.2.840.113549.1.9.16.2.14) on the
 * SignerInfo's `unsignedAttrs` (`[1] IMPLICIT`). The result is a single
 * self-contained PKCS#7 blob in the PDF's /Contents — no sidecar files
 * are produced, and verifiers do NOT fetch external blobs at validation
 * time per PAdES rules. (cryptography-expert §9.4; esignature-standards-
 * expert §3.3.)
 *
 * Skip gracefully if no TSA URL is configured or if every configured TSA
 * round-trip fails — sealing should not break due to an external transient
 * outage. With PDF_SIGNING_TSA_URLS set, the client fans out left-to-right
 * across the list and returns the first granted response (F-11).
 */
@Injectable()
export class TsaClient {
  private readonly logger = new Logger(TsaClient.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  get configured(): boolean {
    return this.tsaUrls().length > 0;
  }

  /**
   * Resolve the ordered list of TSA endpoints to try. PDF_SIGNING_TSA_URLS
   * (comma-separated) takes precedence over the singular PDF_SIGNING_TSA_URL
   * for backward compatibility — when only the singular var is set we fall
   * back to a one-element list. Empty / whitespace entries are dropped.
   */
  private tsaUrls(): ReadonlyArray<string> {
    const csv = this.env.PDF_SIGNING_TSA_URLS;
    if (typeof csv === 'string' && csv.length > 0) {
      const list = csv
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      if (list.length > 0) return list;
    }
    const single = this.env.PDF_SIGNING_TSA_URL;
    if (typeof single === 'string' && single.length > 0) return [single];
    return [];
  }

  /**
   * Request a timestamp for `data`. Hashes with SHA-256, builds a
   * TimeStampReq (RFC 3161), POSTs to each configured TSA in turn, and
   * returns the TimeStampToken bytes from the first granted response.
   *
   * Throws `tsa_all_failed` only after every endpoint has failed. Callers
   * that want best-effort behaviour should catch and fall through to
   * PAdES-B-B (no embedded timestamp).
   */
  async timestamp(data: Buffer): Promise<TimestampResult> {
    const urls = this.tsaUrls();
    if (urls.length === 0) throw new Error('tsa_not_configured');
    const messageImprint = createHash('sha256').update(data).digest();
    const reqDer = buildTimestampReq(messageImprint);

    const failures: string[] = [];
    for (const url of urls) {
      try {
        const result = await this.tryTsa(url, reqDer, messageImprint);
        if (failures.length > 0) {
          this.logger.warn(
            `TSA fallback succeeded on ${url} after ${failures.length} prior failure(s): ${failures.join('; ')}`,
          );
        }
        return result;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        failures.push(`${url}:${reason}`);
        this.logger.warn(`TSA ${url} failed: ${reason}`);
      }
    }
    throw new Error(`tsa_all_failed: ${failures.join('; ')}`);
  }

  private async tryTsa(
    url: string,
    reqDer: Buffer,
    messageImprint: Buffer,
  ): Promise<TimestampResult> {
    this.logger.log(
      `TSA request → ${url} (sha256=${messageImprint.toString('hex').slice(0, 12)}…)`,
    );
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/timestamp-query' },
        body: new Uint8Array(reqDer),
        // Time-stamp authorities are external — bound the wait so a flaky TSA
        // can't hang the sealing worker (rule 9.3). Caller (PadesSigner) is
        // configured to fall back to PAdES-B-B on TSA failure.
        signal: AbortSignal.timeout(TSA_FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw new Error(`tsa_timeout`);
      }
      throw err;
    }
    if (!res.ok) {
      throw new Error(`tsa_http_${res.status}`);
    }
    const respBuf = Buffer.from(await res.arrayBuffer());
    const { status, tokenDer, genTime } = parseTimestampResp(respBuf);
    if (status !== 0 && status !== 1) {
      // 0 = granted; 1 = grantedWithMods. Anything else (2=rejection, …) is fatal.
      throw new Error(`tsa_status_${status}`);
    }
    return {
      tokenDer,
      genTime,
      tsaUrl: url,
      messageImprintSha256Hex: messageImprint.toString('hex'),
    };
  }
}

export interface TimestampResult {
  /** The TimeStampToken itself (a CMS SignedData ContentInfo, DER-encoded). */
  readonly tokenDer: Buffer;
  /** TSA-attested time extracted from the TST's TSTInfo.genTime. ISO string. */
  readonly genTime: string;
  readonly tsaUrl: string;
  readonly messageImprintSha256Hex: string;
}

// --------------------------------------------------------------------
// ASN.1 helpers — request construction + response parsing.
//
// We deliberately inline these rather than pull in a heavy pkijs
// dependency. The request structure is small and the response only
// needs enough parsing to extract the granted TST + genTime.
// --------------------------------------------------------------------

const asn1 = forge.asn1;
const OID_SHA256 = '2.16.840.1.101.3.4.2.1';
const OID_PKCS7_SIGNED_DATA = '1.2.840.113549.1.7.2';

/**
 * Build a TimeStampReq (RFC 3161):
 *
 *   TimeStampReq ::= SEQUENCE {
 *     version                  INTEGER  { v1(1) },
 *     messageImprint           MessageImprint,
 *     reqPolicy                TSAPolicyId              OPTIONAL,
 *     nonce                    INTEGER                  OPTIONAL,
 *     certReq                  BOOLEAN                  DEFAULT FALSE,
 *     extensions               [0] IMPLICIT Extensions  OPTIONAL
 *   }
 *
 *   MessageImprint ::= SEQUENCE {
 *     hashAlgorithm            AlgorithmIdentifier,
 *     hashedMessage            OCTET STRING
 *   }
 */
function buildTimestampReq(messageImprint: Buffer): Buffer {
  // Random 8-byte positive nonce so the TSA's response can't be replayed.
  const nonceBytes = randomPositiveBigInt(8);

  const messageImprintAsn1 = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.OID, false, asn1.oidToDer(OID_SHA256).getBytes()),
      asn1.create(asn1.Class.UNIVERSAL, asn1.Type.NULL, false, ''),
    ]),
    asn1.create(
      asn1.Class.UNIVERSAL,
      asn1.Type.OCTETSTRING,
      false,
      messageImprint.toString('binary'),
    ),
  ]);

  const req = asn1.create(asn1.Class.UNIVERSAL, asn1.Type.SEQUENCE, true, [
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, String.fromCharCode(1)),
    messageImprintAsn1,
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.INTEGER, false, nonceBytes),
    // certReq = TRUE — ask the TSA to include its certificate chain so we
    // can validate without an out-of-band lookup later.
    asn1.create(asn1.Class.UNIVERSAL, asn1.Type.BOOLEAN, false, String.fromCharCode(0xff)),
  ]);

  const der = asn1.toDer(req).getBytes();
  return Buffer.from(der, 'binary');
}

/**
 * Parse a TimeStampResp (RFC 3161):
 *
 *   TimeStampResp ::= SEQUENCE {
 *     status        PKIStatusInfo,
 *     timeStampToken TimeStampToken OPTIONAL
 *   }
 *
 *   PKIStatusInfo ::= SEQUENCE {
 *     status        PKIStatus,
 *     statusString  PKIFreeText     OPTIONAL,
 *     failInfo      PKIFailureInfo  OPTIONAL
 *   }
 *
 * We extract the granted status + the opaque TimeStampToken DER bytes. If
 * parsing succeeds we also dig into the token to pull out `genTime` as ISO.
 */
function parseTimestampResp(resp: Buffer): {
  status: number;
  tokenDer: Buffer;
  genTime: string;
} {
  const tsr = asn1.fromDer(resp.toString('binary'));
  // TimeStampResp SEQUENCE: [0] = PKIStatusInfo, [1] = timeStampToken (optional)
  const statusInfo = tsr.value[0] as forge.asn1.Asn1;
  const statusInteger = (statusInfo.value as forge.asn1.Asn1[])[0] as forge.asn1.Asn1;
  const status = asn1Integer(statusInteger);

  if (!tsr.value[1]) {
    return { status, tokenDer: Buffer.alloc(0), genTime: '' };
  }
  const tokenAsn1 = tsr.value[1] as forge.asn1.Asn1;
  const tokenBinary = asn1.toDer(tokenAsn1).getBytes();
  const tokenDer = Buffer.from(tokenBinary, 'binary');

  // TST is CMS ContentInfo → SignedData. Dig: ContentInfo SEQUENCE {
  //   contentType OID (id-signedData = 1.2.840.113549.1.7.2),
  //   content [0] EXPLICIT SignedData
  // }
  // SignedData → encapContentInfo (TSTInfo, wrapped in OCTET STRING [0] EXPLICIT).
  // TSTInfo SEQUENCE { version, policy, messageImprint, serialNumber, genTime GeneralizedTime, ... }
  let genTime = '';
  try {
    const contentInfo = tokenAsn1;
    const ciSeq = contentInfo.value as forge.asn1.Asn1[];
    const ciOid = asn1.derToOid(ciSeq[0]!.value as unknown as string as string);
    if (ciOid === OID_PKCS7_SIGNED_DATA) {
      const explicit0 = ciSeq[1]! as forge.asn1.Asn1;
      const signedData = (explicit0.value as forge.asn1.Asn1[])[0]! as forge.asn1.Asn1;
      const sdValue = signedData.value as forge.asn1.Asn1[];
      // encapContentInfo is at index 2 (after version + digestAlgorithms).
      const encap = sdValue[2]! as forge.asn1.Asn1;
      const encapValue = encap.value as forge.asn1.Asn1[];
      const eciExplicit = encapValue[1]! as forge.asn1.Asn1;
      const octetString = (eciExplicit.value as forge.asn1.Asn1[])[0]! as forge.asn1.Asn1;
      const tstInfoBytes = octetString.value as unknown as string;
      const tstInfo = asn1.fromDer(tstInfoBytes);
      const tstValue = tstInfo.value as forge.asn1.Asn1[];
      // TSTInfo: version, policy, messageImprint, serialNumber, genTime, ...
      const genTimeAsn1 = tstValue[4]! as forge.asn1.Asn1;
      genTime = parseGeneralizedTime(genTimeAsn1.value as unknown as string);
    }
  } catch {
    // Not fatal — the token is still usable, we just didn't extract genTime.
    genTime = '';
  }

  return { status, tokenDer, genTime };
}

function asn1Integer(a: forge.asn1.Asn1): number {
  // Node-forge represents INTEGER as raw bytes. For small non-negatives
  // this is enough — TSA status codes are always 0..5.
  const v = a.value as unknown as string;
  let n = 0;
  for (let i = 0; i < v.length; i++) n = (n << 8) | (v.charCodeAt(i) & 0xff);
  return n;
}

/** "20260424083512Z" → "2026-04-24T08:35:12Z" (ISO). */
function parseGeneralizedTime(raw: string): string {
  // YYYYMMDDHHMMSS[.fff]Z
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\.\d+)?Z$/.exec(raw);
  if (!m) return '';
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}${m[7] ?? ''}Z`;
}

function randomPositiveBigInt(lengthBytes: number): string {
  // Use the OS CSPRNG (crypto.randomBytes) — forge.random.getBytesSync uses a
  // userspace PRNG which is less secure for cryptographic nonces.
  const buf = randomBytes(lengthBytes);
  // Clear the high bit so the INTEGER is unambiguously non-negative.
  buf[0] = buf[0]! & 0x7f;
  return buf.toString('binary');
}
