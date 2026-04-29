/**
 * generate-kms-binding-cert.ts — produces the X.509 binding certificate
 * that pairs with the AWS KMS RSA-3072 SIGN_VERIFY key behind
 * KmsPadesSigner (apps/api/src/sealing/pades-signer.ts).
 *
 * Why KMS-signed?
 * ---------------
 * KmsPadesSigner needs a PEM cert whose embedded public key matches
 * what the KMS key returns from kms:GetPublicKey, so verifiers (Adobe
 * Reader, EU DSS) can confirm the signature on each sealed PDF was
 * produced by the holder of the cert's private key.
 *
 * Conceptually we could mint the cert with any CA (a local OpenSSL CA,
 * a corporate PKI, or — for production — a qualified TSP). For the
 * MVP the production policy is a *self-signed* cert where the issuer
 * IS the KMS key. That keeps the trust chain to one element and
 * removes the need to keep a second signing key around. The trade-off
 * is that verifiers won't auto-trust the chain; the operator must
 * surface the cert in the audit pack so end-users can pin it.
 *
 * What this script does:
 *   1. kms:GetPublicKey -> DER-encoded SubjectPublicKeyInfo
 *      -> parse into a forge-compatible public key.
 *   2. Build the X.509 certificate body (forge.pki.createCertificate)
 *      with the KMS public key as the subjectPublicKeyInfo, the
 *      requested CN/O/C in subject AND issuer (self-signed),
 *      validity 1 day -> 5 years from now, RSASSA_PKCS1_V1_5_SHA_256.
 *   3. DER-encode the tbsCertificate (the bytes the signature covers).
 *   4. SHA-256 the tbsCertificate; kms:Sign({ MessageType: DIGEST,
 *      SigningAlgorithm: RSASSA_PKCS1_V1_5_SHA_256 }) — the same
 *      operation KmsCmsSigner performs at runtime, which proves the
 *      cert and the runtime signer agree on the algorithm.
 *   5. Assemble the full Certificate ASN.1 (tbsCertificate +
 *      signatureAlgorithm + signature OCTET STRING) and PEM-encode.
 *   6. Write to --out (or stdout).
 *
 * Args:
 *   --key-id     KMS key id, ARN, or alias (required)
 *   --region     AWS region (required)
 *   --out        Output PEM path (default: stdout)
 *   --cn         Subject CN (default: "Seald PAdES Sealing")
 *   --org        Subject O  (default: "Seald")
 *   --country    Subject C  (default: "US")
 *   --years      Validity period in years (default: 5)
 *
 * Usage:
 *   pnpm --filter api ts-node scripts/generate-kms-binding-cert.ts \
 *     --key-id alias/seald-pades-sealing-prod \
 *     --region us-east-1 \
 *     --out apps/api/.local/seald-pades-prod.crt.pem
 *
 * After writing the PEM, set on the API host:
 *   PDF_SIGNING_PROVIDER=kms
 *   PDF_SIGNING_KMS_KEY_ID=<key-id-or-alias>
 *   PDF_SIGNING_KMS_REGION=<region>
 *   PDF_SIGNING_KMS_CERT_PEM_PATH=<path-to-pem>
 *
 * Compliance refs:
 *   - cryptography-expert §8 (production keys live in KMS).
 *   - esignature-standards-expert §3.2 (PAdES signing-cert binding).
 *   - RFC 5280 §4.1 (Certificate / TBSCertificate ASN.1).
 *   - AWS docs: Sign API + RSASSA_PKCS1_V1_5_SHA_256 expects a 32-byte
 *     digest when MessageType = DIGEST.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
import {
  KMSClient,
  GetPublicKeyCommand,
  SignCommand,
  DescribeKeyCommand,
} from '@aws-sdk/client-kms';
import forge from 'node-forge';

// --- OIDs -----------------------------------------------------------
const OID_SHA256_WITH_RSA = '1.2.840.113549.1.1.11';

interface CliArgs {
  keyId: string;
  region: string;
  out: string | null;
  cn: string;
  org: string;
  country: string;
  years: number;
}

function parseCli(): CliArgs {
  const { values } = parseArgs({
    options: {
      'key-id': { type: 'string' },
      region: { type: 'string' },
      out: { type: 'string' },
      cn: { type: 'string', default: 'Seald PAdES Sealing' },
      org: { type: 'string', default: 'Seald' },
      country: { type: 'string', default: 'US' },
      years: { type: 'string', default: '5' },
    },
    strict: true,
    allowPositionals: false,
  });

  if (!values['key-id'] || !values.region) {
    throw new Error(
      'Missing required args. Usage: --key-id <id|alias|arn> --region <aws-region> [--out path] [--cn "..."] [--org "..."] [--country US] [--years 5]',
    );
  }

  const years = Number.parseInt(String(values.years ?? '5'), 10);
  if (!Number.isFinite(years) || years < 1 || years > 30) {
    throw new Error(`--years must be an integer 1..30 (got ${String(values.years)})`);
  }

  return {
    keyId: String(values['key-id']),
    region: String(values.region),
    out: values.out ? String(values.out) : null,
    cn: String(values.cn),
    org: String(values.org),
    country: String(values.country),
    years,
  };
}

/**
 * AWS KMS returns the public key as a DER-encoded
 * SubjectPublicKeyInfo (RFC 5280 §4.1.2.7). Forge parses PEM, so wrap
 * the DER in a SPKI PEM block first.
 */
function publicKeyFromKmsDer(spkiDer: Uint8Array): forge.pki.rsa.PublicKey {
  const b64 = Buffer.from(spkiDer).toString('base64');
  const pem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----\n`;
  const key = forge.pki.publicKeyFromPem(pem);
  // forge.pki.publicKeyFromPem returns the union type forge.pki.PublicKey;
  // for RSA SPKIs it's always an rsa.PublicKey.
  if (!('n' in key) || !('e' in key)) {
    throw new Error('KMS GetPublicKey returned a non-RSA SPKI; KmsPadesSigner only supports RSA.');
  }
  return key as forge.pki.rsa.PublicKey;
}

/**
 * Build an RFC 5280 X.509 certificate with the KMS public key as
 * subject SPKI and pre-computed serial / validity. The signature is
 * filled in *afterwards* by computing tbsCertificate's DER, hashing
 * it, and asking KMS to sign that hash — the standard external-CA
 * flow, just with KMS as the CA.
 *
 * Returns the prepared forge cert plus its tbsCertificate ASN.1 node
 * (for DER encoding) and the issuer/subject DN (so we can assemble
 * the final Certificate by hand).
 */
function buildCertSkeleton(args: CliArgs, pubKey: forge.pki.rsa.PublicKey): forge.pki.Certificate {
  const cert = forge.pki.createCertificate();
  cert.publicKey = pubKey;

  // Random 20-byte positive serial — RFC 5280 §4.1.2.2 says serials
  // SHOULD be unique and non-negative; OWASP cheat sheet recommends
  // ≥ 64 random bits. 20 bytes is well past that.
  const serialBytes = forge.random.getBytesSync(20);
  // Strip the high bit so the INTEGER stays positive once DER-encoded.
  const positiveSerial =
    String.fromCharCode(serialBytes.charCodeAt(0) & 0x7f) + serialBytes.slice(1);
  cert.serialNumber = forge.util.bytesToHex(positiveSerial);

  const now = new Date();
  cert.validity.notBefore = new Date(now.getTime() - 24 * 60 * 60 * 1000); // -1 day for clock skew
  cert.validity.notAfter = new Date(now.getTime());
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + args.years);

  const dn: forge.pki.CertificateField[] = [
    { name: 'commonName', value: args.cn },
    { name: 'organizationName', value: args.org },
    { name: 'countryName', value: args.country },
  ];
  cert.setSubject(dn);
  cert.setIssuer(dn); // self-signed: subject == issuer

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: false,
      dataEncipherment: false,
    },
    {
      name: 'extKeyUsage',
      // 1.3.6.1.5.5.7.3.4 = id-kp-emailProtection (covers document
      // signing in most PAdES verifiers' trust evaluation). We
      // intentionally do NOT include serverAuth/clientAuth.
      emailProtection: true,
    },
    {
      name: 'subjectKeyIdentifier',
    },
  ]);

  // forge needs signatureOid set so DER encoding emits the correct
  // signatureAlgorithm field; the .signature OCTET STRING is filled
  // by us after the KMS round trip.
  cert.signatureOid = OID_SHA256_WITH_RSA;
  cert.siginfo = { algorithmOid: OID_SHA256_WITH_RSA };

  return cert;
}

/**
 * The TBS portion (tbsCertificate) is the part of the X.509 cert that
 * gets signed. forge exposes tbsCertificate construction via the
 * internal pki.getTBSCertificate helper.
 */
function tbsCertificateDer(cert: forge.pki.Certificate): Buffer {
  // forge's public API: pki.getTBSCertificate(cert) returns the ASN.1
  // tbsCertificate node. DER-encode it.
  // (The function exists at runtime; types occasionally lag the impl,
  // hence the loose access.)
  const getTbs = (
    forge.pki as unknown as {
      getTBSCertificate: (c: forge.pki.Certificate) => forge.asn1.Asn1;
    }
  ).getTBSCertificate;
  const tbs = getTbs(cert);
  return Buffer.from(forge.asn1.toDer(tbs).getBytes(), 'binary');
}

/**
 * Final assembly: { tbsCertificate, signatureAlgorithm, signatureValue }.
 * Returned as a forge cert ready to PEM-encode.
 */
function attachSignatureToCert(
  cert: forge.pki.Certificate,
  signature: Buffer,
): forge.pki.Certificate {
  // forge stores the signature as a binary string on .signature; the
  // PEM serialiser reads it from there.
  cert.signature = signature.toString('binary');
  return cert;
}

async function main(): Promise<void> {
  const args = parseCli();
  const kms = new KMSClient({ region: args.region });

  // --- Sanity: verify the key spec / usage match what we expect ---
  const describe = await kms.send(new DescribeKeyCommand({ KeyId: args.keyId }));
  const meta = describe.KeyMetadata;
  if (!meta) {
    throw new Error(`kms:DescribeKey returned no metadata for ${args.keyId}`);
  }
  if (meta.KeyUsage !== 'SIGN_VERIFY') {
    throw new Error(`KMS key ${args.keyId} has KeyUsage=${meta.KeyUsage}; expected SIGN_VERIFY`);
  }
  if (meta.CustomerMasterKeySpec !== 'RSA_3072' && meta.KeySpec !== 'RSA_3072') {
    throw new Error(
      `KMS key ${args.keyId} has spec=${meta.KeySpec ?? meta.CustomerMasterKeySpec}; expected RSA_3072`,
    );
  }
  console.log(
    `[kms] key=${meta.Arn ?? args.keyId} spec=RSA_3072 usage=SIGN_VERIFY state=${meta.KeyState ?? 'unknown'}`,
  );

  // --- 1. Pull the public key ---
  const pkOut = await kms.send(new GetPublicKeyCommand({ KeyId: args.keyId }));
  if (!pkOut.PublicKey) {
    throw new Error('kms:GetPublicKey returned no PublicKey');
  }
  const pubKey = publicKeyFromKmsDer(pkOut.PublicKey);
  console.log(`[kms] retrieved public key: modulus_bits=${pubKey.n.bitLength()}`);

  // --- 2. Build the cert skeleton ---
  const cert = buildCertSkeleton(args, pubKey);

  // --- 3. DER-encode the tbsCertificate, hash it ---
  const tbsDer = tbsCertificateDer(cert);
  const tbsDigest = createHash('sha256').update(tbsDer).digest();
  console.log(
    `[cert] tbs_bytes=${tbsDer.length} tbs_sha256=${tbsDigest.toString('hex').slice(0, 16)}…`,
  );

  // --- 4. Ask KMS to sign the digest ---
  const signOut = await kms.send(
    new SignCommand({
      KeyId: args.keyId,
      Message: tbsDigest,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'RSASSA_PKCS1_V1_5_SHA_256',
    }),
  );
  if (!signOut.Signature) {
    throw new Error('kms:Sign returned no Signature');
  }
  const signature = Buffer.from(signOut.Signature);
  console.log(`[kms] signed: signature_bytes=${signature.length}`);

  // --- 5. Attach signature, PEM-encode, write ---
  const signedCert = attachSignatureToCert(cert, signature);
  const pem = forge.pki.certificateToPem(signedCert);

  if (args.out) {
    const outPath = resolve(process.cwd(), args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, pem, { encoding: 'utf8', mode: 0o600 });
    console.log(`[ok] wrote ${pem.length} bytes -> ${outPath}`);
  } else {
    process.stdout.write(pem);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[fatal] ${msg}`);
  process.exit(1);
});
