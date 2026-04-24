import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import forge from 'node-forge';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

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
 * For MVP we write the TST as a sidecar file (`{envelope_id}/timestamp.tsr`)
 * next to sealed.pdf. A full PAdES-B-T integration would embed the TST as
 * an unsigned attribute on the SignerInfo (OID 1.2.840.113549.1.9.16.2.14);
 * that's tracked as a follow-up because it requires SignerInfo ASN.1
 * rewriting on top of node-forge.
 *
 * Skip gracefully if PDF_SIGNING_TSA_URL is not set or if the TSA round-trip
 * fails — sealing should not break due to an external transient outage.
 */
@Injectable()
export class TsaClient {
  private readonly logger = new Logger(TsaClient.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  get configured(): boolean {
    return (
      typeof this.env.PDF_SIGNING_TSA_URL === 'string' && this.env.PDF_SIGNING_TSA_URL.length > 0
    );
  }

  /**
   * Request a timestamp for `data`. Hashes with SHA-256, builds a
   * TimeStampReq (RFC 3161), POSTs to the TSA, and returns the
   * TimeStampToken bytes from a granted response.
   *
   * Throws on transport errors, HTTP errors, or non-granted TSR statuses.
   * Callers that want best-effort behaviour should catch and fall through.
   */
  async timestamp(data: Buffer): Promise<TimestampResult> {
    if (!this.configured) throw new Error('tsa_not_configured');
    const url = this.env.PDF_SIGNING_TSA_URL!;
    const messageImprint = createHash('sha256').update(data).digest();
    const reqDer = buildTimestampReq(messageImprint);
    this.logger.log(
      `TSA request → ${url} (sha256=${messageImprint.toString('hex').slice(0, 12)}…)`,
    );

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query' },
      body: new Uint8Array(reqDer),
    });
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
  const bytes = forge.random.getBytesSync(lengthBytes);
  // Clear the high bit so the INTEGER is unambiguously non-negative.
  const cleared = String.fromCharCode(bytes.charCodeAt(0) & 0x7f) + bytes.slice(1);
  return cleared;
}
