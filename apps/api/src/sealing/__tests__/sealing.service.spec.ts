import forge from 'node-forge';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { AppEnv } from '../../config/env.schema';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { Envelope } from '../../envelopes/envelope.entity';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { makeEnvelope, makeField, makeSigner } from '../../../test/factories';
import { assertSigningCertificateV2 } from '../p12-tsa-signer';
import { NoopPadesSigner } from '../pades-signer';
import { SealingService } from '../sealing.service';

/**
 * Burn-in unit tests focused on the two production bugs the user filed:
 *   1. Signature field rendered the initials image (storage-path collision).
 *   2. Checkbox glyph was the literal letter 'X' instead of a checkmark.
 *
 * The tests bypass the rest of the SealingService pipeline and exercise the
 * private `burnIn` method via a typed bracket cast so we don't have to
 * stand up the worker, audit-PDF renderer, or PAdES signer just to
 * inspect a few drawing decisions.
 */

type BurnInFn = (envelope: Envelope, originalBytes: Buffer) => Promise<Buffer>;

const ENV_ID = '00000000-0000-0000-0000-000000000001';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000aa';

async function makeOnePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

async function tinySolidPng(rgba: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 16,
      channels: 4,
      background: { ...rgba, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

// Rule 11.1 — Build the envelope from the shared factories. The
// `signers`/`fields` shape is unique to the burn-in spec so we still
// declare it inline, but the per-field defaults (page=1, required=true,
// etc.) come from `makeField()`.
function makeBurnInEnvelope(): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    title: 'Burn-in Spec Envelope',
    status: 'sealing',
    signers: [
      makeSigner({
        id: SIGNER_ID,
        status: 'completed',
        signed_at: new Date().toISOString(),
      }),
    ],
    fields: [
      // Each field placed in a distinct quadrant so the assertions below
      // can be page-position-agnostic — we only care WHICH image went in
      // and WHETHER drawText('X') happened, not pixel coordinates.
      makeField({
        id: '00000000-0000-0000-0000-00000000f001',
        signer_id: SIGNER_ID,
        kind: 'signature',
        x: 0.05,
        y: 0.05,
        width: 0.2,
        height: 0.05,
      }),
      makeField({
        id: '00000000-0000-0000-0000-00000000f002',
        signer_id: SIGNER_ID,
        kind: 'initials',
        x: 0.7,
        y: 0.05,
        width: 0.08,
        height: 0.04,
      }),
      makeField({
        id: '00000000-0000-0000-0000-00000000f003',
        signer_id: SIGNER_ID,
        kind: 'checkbox',
        x: 0.05,
        y: 0.5,
        width: 0.03,
        height: 0.03,
        value_boolean: true,
      }),
    ],
  });
}

interface InMemoryStorage {
  readonly map: Map<string, Buffer>;
  readonly downloads: string[];
  readonly service: Pick<StorageService, 'download' | 'upload'>;
}

function makeStorage(seed: Record<string, Buffer>): InMemoryStorage {
  const map = new Map<string, Buffer>(Object.entries(seed));
  const downloads: string[] = [];
  const service: Pick<StorageService, 'download' | 'upload'> = {
    async download(path: string): Promise<Buffer> {
      downloads.push(path);
      const buf = map.get(path);
      if (!buf) throw new Error(`not_found:${path}`);
      return buf;
    },
    async upload(path: string, body: Buffer): Promise<void> {
      map.set(path, Buffer.from(body));
    },
  };
  return { map, downloads, service };
}

function makeService(storage: Pick<StorageService, 'download' | 'upload'>): SealingService {
  // We pass `unknown as` into the SealingService constructor for the
  // collaborators we don't exercise from the burn-in path. The Nest
  // container wires real instances in production — here we only need the
  // storage adapter and a noop pades signer so embedPng + save() work.
  return new SealingService(
    {} as EnvelopesRepository,
    storage as StorageService,
    {} as OutboundEmailsRepository,
    new NoopPadesSigner(),
    // DssInjector is a no-op when PDF_SIGNING_BLT_ENABLED is false (the
    // default in tests), so the burn-in spec doesn't exercise it. Pass a
    // plain stub object — the SealingService never calls into it on the
    // disabled path.
    { upgradeToBLt: async (b: Buffer) => b } as unknown as import('../dss-injector').DssInjector,
    { APP_PUBLIC_URL: 'http://localhost' } as AppEnv,
  );
}

describe('SealingService burn-in', () => {
  it('reads signature image from {id}.png and initials image from {id}-initials.png', async () => {
    const sigBytes = await tinySolidPng({ r: 200, g: 0, b: 0 });
    const initialsBytes = await tinySolidPng({ r: 0, g: 0, b: 200 });
    const storage = makeStorage({
      [`${ENV_ID}/signatures/${SIGNER_ID}.png`]: sigBytes,
      [`${ENV_ID}/signatures/${SIGNER_ID}-initials.png`]: initialsBytes,
    });
    const svc = makeService(storage.service);
    const burnIn = (svc as unknown as { burnIn: BurnInFn }).burnIn.bind(svc);

    const original = await makeOnePagePdf();
    const out = await burnIn(makeBurnInEnvelope(), original);

    // The burn-in must have asked storage for both deterministic paths.
    expect(storage.downloads).toEqual(
      expect.arrayContaining([
        `${ENV_ID}/signatures/${SIGNER_ID}.png`,
        `${ENV_ID}/signatures/${SIGNER_ID}-initials.png`,
      ]),
    );

    // Sanity: result is still a valid PDF that pdf-lib can re-load.
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('falls back to the signature image when no initials image is present (legacy envelopes)', async () => {
    const sigBytes = await tinySolidPng({ r: 200, g: 0, b: 0 });
    const storage = makeStorage({
      // Note: no `-initials.png` entry on disk.
      [`${ENV_ID}/signatures/${SIGNER_ID}.png`]: sigBytes,
    });
    const svc = makeService(storage.service);
    const burnIn = (svc as unknown as { burnIn: BurnInFn }).burnIn.bind(svc);

    const original = await makeOnePagePdf();
    const out = await burnIn(makeBurnInEnvelope(), original);

    // We still try to read the initials path — that's what makes this a
    // *fallback* rather than a no-op — but a missing artifact must not
    // throw.
    expect(storage.downloads).toEqual(
      expect.arrayContaining([
        `${ENV_ID}/signatures/${SIGNER_ID}.png`,
        `${ENV_ID}/signatures/${SIGNER_ID}-initials.png`,
      ]),
    );

    // Output is still a valid PDF (the legacy fallback let the seal succeed).
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it('renders a vector checkmark, not the literal text "X"', async () => {
    const sigBytes = await tinySolidPng({ r: 200, g: 0, b: 0 });
    const initialsBytes = await tinySolidPng({ r: 0, g: 0, b: 200 });
    const storage = makeStorage({
      [`${ENV_ID}/signatures/${SIGNER_ID}.png`]: sigBytes,
      [`${ENV_ID}/signatures/${SIGNER_ID}-initials.png`]: initialsBytes,
    });
    const svc = makeService(storage.service);
    const burnIn = (svc as unknown as { burnIn: BurnInFn }).burnIn.bind(svc);

    // Spy on the instance method on PDFPage *before* the burn-in runs so
    // we can capture the exact draw operations the service issues. This
    // is more precise than scanning the output content stream — pdf-lib
    // compresses streams by default, so a substring search for the
    // glyph 'X' would have a high false-negative rate.
    const PDFPagePrototype = (await import('pdf-lib')).PDFPage.prototype;
    const drawLineSpy = jest.spyOn(PDFPagePrototype, 'drawLine');
    const drawTextSpy = jest.spyOn(PDFPagePrototype, 'drawText');

    try {
      const original = await makeOnePagePdf();
      await burnIn(makeBurnInEnvelope(), original);

      // Affirmative: the checkmark uses two distinct line segments.
      // (Checkbox outline is a drawRectangle, not drawLine, so this
      // count is exclusive to the tick.)
      expect(drawLineSpy).toHaveBeenCalledTimes(2);

      // No drawText call may carry the literal 'X' value. The checkbox
      // legitimately needs zero text calls; other fields (text/date)
      // would carry their own content but the fixture only has
      // signature/initials/checkbox, so the assertion is unambiguous.
      const xCalls = drawTextSpy.mock.calls.filter(([text]) => text === 'X' || text === 'x');
      expect(xCalls).toHaveLength(0);
    } finally {
      drawLineSpy.mockRestore();
      drawTextSpy.mockRestore();
    }
  });
});

// --------------------------------------------------------------------
// assertSigningCertificateV2 — defense-in-depth check for the modern
// ESS attribute mandated by PAdES baseline (cryptography-expert §11.4,
// esignature-standards-expert §3.2). We hand-roll minimal valid + invalid
// CMS ASN.1 trees so we don't need to spin up a real P12 just to prove
// the helper does what it claims.
// --------------------------------------------------------------------

const OID_PKCS7_SIGNED_DATA = '1.2.840.113549.1.7.2';
const OID_DATA = '1.2.840.113549.1.7.1';
const OID_SIGNING_CERTIFICATE_V2 = '1.2.840.113549.1.9.16.2.47';
const OID_SIGNING_CERTIFICATE_V1 = '1.2.840.113549.1.9.16.2.12';
const OID_CONTENT_TYPE = '1.2.840.113549.1.9.3';

/** Build an Attribute SEQUENCE { attrType OID, attrValues SET } skeleton. */
function makeAttribute(oid: string): forge.asn1.Asn1 {
  return forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SEQUENCE, true, [
    forge.asn1.create(
      forge.asn1.Class.UNIVERSAL,
      forge.asn1.Type.OID,
      false,
      forge.asn1.oidToDer(oid).getBytes(),
    ),
    forge.asn1.create(forge.asn1.Class.UNIVERSAL, forge.asn1.Type.SET, true, []),
  ]);
}

/**
 * Hand-roll a minimal ContentInfo → SignedData → SignerInfos[0] ASN.1 with
 * the supplied list of signed-attribute OIDs. Only the fields the helper
 * walks over are populated; everything else is a stub.
 */
function makeFakeCms(signedAttrOids: string[]): forge.asn1.Asn1 {
  const a = forge.asn1;
  const signedAttrs = a.create(
    a.Class.CONTEXT_SPECIFIC,
    0,
    true,
    signedAttrOids.map((oid) => makeAttribute(oid)),
  );
  // SignerInfo: version INTEGER, sid SEQ (placeholder), digestAlg SEQ, signedAttrs [0], …
  const signerInfo = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(a.Class.UNIVERSAL, a.Type.INTEGER, false, String.fromCharCode(1)),
    a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, []),
    a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, []),
    signedAttrs,
  ]);
  const signerInfos = a.create(a.Class.UNIVERSAL, a.Type.SET, true, [signerInfo]);
  // SignedData: version, digestAlgorithms (SET), encapContentInfo (SEQ),
  // [optional certs/crls], signerInfos (SET — last, which is what
  // findFirstSignerInfo looks for).
  const signedData = a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(a.Class.UNIVERSAL, a.Type.INTEGER, false, String.fromCharCode(1)),
    a.create(a.Class.UNIVERSAL, a.Type.SET, true, []),
    a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
      a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(OID_DATA).getBytes()),
    ]),
    signerInfos,
  ]);
  const explicit0 = a.create(a.Class.CONTEXT_SPECIFIC, 0, true, [signedData]);
  return a.create(a.Class.UNIVERSAL, a.Type.SEQUENCE, true, [
    a.create(a.Class.UNIVERSAL, a.Type.OID, false, a.oidToDer(OID_PKCS7_SIGNED_DATA).getBytes()),
    explicit0,
  ]);
}

describe('assertSigningCertificateV2', () => {
  it('passes when signing-certificate-v2 is present and v1 is absent', () => {
    const cms = makeFakeCms([OID_CONTENT_TYPE, OID_SIGNING_CERTIFICATE_V2]);
    expect(() => assertSigningCertificateV2(cms)).not.toThrow();
  });

  it('throws pades_b_b_violation when signing-certificate-v2 is missing', () => {
    const cms = makeFakeCms([OID_CONTENT_TYPE]);
    expect(() => assertSigningCertificateV2(cms)).toThrow(
      /pades_b_b_violation: signing_certificate_v2_missing/,
    );
  });

  it('throws pades_b_b_violation when the legacy SHA-1 signing-certificate-v1 is present', () => {
    const cms = makeFakeCms([
      OID_CONTENT_TYPE,
      OID_SIGNING_CERTIFICATE_V1,
      OID_SIGNING_CERTIFICATE_V2,
    ]);
    expect(() => assertSigningCertificateV2(cms)).toThrow(
      /pades_b_b_violation: legacy_signing_certificate_v1_present/,
    );
  });
});
