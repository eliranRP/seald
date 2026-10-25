import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import type { FeatureFlag } from 'shared';
import type { AppEnv } from '../../config/env.schema';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { makeEnvelope, makeEvent, makeSigner } from '../../../test/factories';
import { declinedPdfPath } from '../declined-pdf-path';
import type { DssInjector } from '../dss-injector';
import { PadesSigner, type PadesSignResult } from '../pades-signer';
import {
  EMPTY_SEAL_PROGRESS,
  SealingService,
  sealParkedSignedPath,
  type SealProgress,
} from '../sealing.service';
import { InMemoryEnvelopeDocumentsRepository } from '../../../test/in-memory-envelope-documents-repository';

/**
 * WP-01 items 3 and 4: the optional pre-seal certificate appended inside
 * sealed.pdf (flag `appendCertificate`) and the stamped, sealed
 * declined.pdf written by `audit_only` jobs.
 */

const ENV_ID = '00000000-0000-0000-0000-000000000001';

/** Records every PDF handed to sign(); returns it unchanged. */
class RecordingSigner extends PadesSigner {
  readonly appliesCmsSeal = true;
  readonly inputs: Buffer[] = [];
  async sign(pdf: Buffer): Promise<PadesSignResult> {
    this.inputs.push(pdf);
    return { pdf, timestampApplied: true };
  }
}

interface Harness {
  readonly svc: SealingService;
  readonly signer: RecordingSigner;
  readonly files: Map<string, Buffer>;
  readonly dssCalls: Buffer[];
  readonly auditSet: string[];
}

function makeHarness(envelope: Envelope, events: EnvelopeEvent[], seed: Map<string, Buffer>) {
  const files = new Map(seed);
  const dssCalls: Buffer[] = [];
  const auditSet: string[] = [];
  const storage = {
    async download(path: string): Promise<Buffer> {
      const b = files.get(path);
      if (!b) throw new Error(`not_found:${path}`);
      return b;
    },
    async upload(path: string, body: Buffer): Promise<void> {
      files.set(path, Buffer.from(body));
    },
    async remove(paths: string[]): Promise<void> {
      for (const p of paths) files.delete(p);
    },
  } as unknown as StorageService;
  const repo = {
    async findByIdWithAll() {
      return envelope;
    },
    async listEventsForEnvelope() {
      return events;
    },
    async listSignerAuditDetails() {
      return [];
    },
    async setAuditFile(_id: string, path: string) {
      auditSet.push(path);
      return envelope;
    },
    // Lose the race on purpose: the spec stops after the artefacts are
    // uploaded and never reaches the completion fan-out.
    async transitionToSealed() {
      return null;
    },
  } as unknown as EnvelopesRepository;
  const signer = new RecordingSigner();
  const dss = {
    async upgradeToBLt(b: Buffer) {
      dssCalls.push(b);
      return b;
    },
  } as unknown as DssInjector;
  const svc = new SealingService(
    repo,
    storage,
    {} as OutboundEmailsRepository,
    signer,
    dss,
    {
      APP_PUBLIC_URL: 'https://seald.example',
    } as AppEnv,
    new InMemoryEnvelopeDocumentsRepository(),
  );
  return { svc, signer, files, dssCalls, auditSet } satisfies Harness;
}

async function pdfWithPages(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage([612, 792]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

async function pageCount(b: Buffer): Promise<number> {
  return (await PDFDocument.load(b)).getPageCount();
}

/**
 * pdf-lib writes standard-font text as a hex string inside a Flate-encoded
 * content stream. Inflate every stream and look for the hex.
 */
function containsDrawnText(pdf: Buffer, text: string): boolean {
  const hex = Buffer.from(text, 'latin1').toString('hex').toUpperCase();
  const raw = pdf.toString('latin1');
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const start = m.index + m[0].length;
    const end = raw.indexOf('endstream', start);
    if (end < 0) break;
    let body = pdf.subarray(start, end);
    try {
      body = inflateSync(body);
    } catch {
      // not compressed
    }
    if (body.toString('latin1').toUpperCase().includes(hex)) return true;
  }
  return false;
}

function withFlag<T>(flag: FeatureFlag, on: boolean, fn: () => Promise<T>): Promise<T> {
  const host = globalThis as unknown as {
    __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> | undefined;
  };
  const prior = host.__SEALD_FEATURE_OVERRIDES__;
  host.__SEALD_FEATURE_OVERRIDES__ = { ...prior, [flag]: on };
  return fn().finally(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = prior;
  });
}

const EVENTS: EnvelopeEvent[] = [
  makeEvent({ id: '00000000-0000-0000-0000-00000000e001', event_type: 'created', signer_id: null }),
  makeEvent({
    id: '00000000-0000-0000-0000-00000000e002',
    event_type: 'signed',
    created_at: '2026-04-25T10:05:00.000Z',
  }),
];

// These specs render real PDFs (React-PDF + pdf-lib), which takes several
// seconds per case on a loaded runner; jest's 5 s default times them out.
jest.setTimeout(30_000);

describe('SealingService — audit_only writes declined.pdf (WP-01 item 4)', () => {
  it.each([
    ['declined', 'Declined — not signed'],
    ['expired', 'Expired — not signed'],
    ['canceled', 'Canceled — not signed'],
  ] as const)('stamps and seals the original for a %s envelope', async (status, banner) => {
    const original = await pdfWithPages(3);
    const h = makeHarness(
      makeEnvelope({ id: ENV_ID, status }),
      EVENTS,
      new Map([[`${ENV_ID}/original.pdf`, original]]),
    );
    await h.svc.processAuditOnlyJob(ENV_ID);

    const declined = h.files.get(declinedPdfPath(ENV_ID));
    expect(declined).toBeDefined();
    // Sealed the same way as sealed.pdf: sign() then the DSS/LTA upgrade.
    expect(h.signer.inputs).toHaveLength(1);
    expect(h.dssCalls).toHaveLength(1);
    expect(await pageCount(declined!)).toBe(3);
    // "—" is 0x97 in WinAnsi, so match the ASCII part of the banner.
    expect(containsDrawnText(h.signer.inputs[0]!, banner.split(' — ')[0]!)).toBe(true);
    expect(containsDrawnText(h.signer.inputs[0]!, 'not signed')).toBe(true);
    // audit.pdf still produced and recorded.
    expect(h.files.has(`${ENV_ID}/audit.pdf`)).toBe(true);
    expect(h.auditSet).toEqual([`${ENV_ID}/audit.pdf`]);
  });

  it('writes no declined.pdf for a non-terminal status', async () => {
    const h = makeHarness(
      makeEnvelope({ id: ENV_ID, status: 'awaiting_others' }),
      EVENTS,
      new Map([[`${ENV_ID}/original.pdf`, await pdfWithPages(1)]]),
    );
    await h.svc.processAuditOnlyJob(ENV_ID);
    expect(h.files.has(declinedPdfPath(ENV_ID))).toBe(false);
    expect(h.signer.inputs).toHaveLength(0);
    expect(h.auditSet).toHaveLength(1);
  });

  it('still writes audit.pdf when original.pdf is missing', async () => {
    const h = makeHarness(makeEnvelope({ id: ENV_ID, status: 'declined' }), EVENTS, new Map());
    await h.svc.processAuditOnlyJob(ENV_ID);
    expect(h.files.has(declinedPdfPath(ENV_ID))).toBe(false);
    expect(h.auditSet).toEqual([`${ENV_ID}/audit.pdf`]);
  });
});

describe('SealingService — appended pre-seal certificate (WP-01 item 3)', () => {
  function sealingEnvelope(): Envelope {
    return makeEnvelope({
      id: ENV_ID,
      status: 'sealing',
      signers: [makeSigner({ status: 'completed', signed_at: '2026-04-25T10:05:00.000Z' })],
      fields: [],
    });
  }

  it('flag off: sealed.pdf has only the original pages', async () => {
    const h = makeHarness(
      sealingEnvelope(),
      EVENTS,
      new Map([[`${ENV_ID}/original.pdf`, await pdfWithPages(2)]]),
    );
    await withFlag('appendCertificate', false, () => h.svc.processSealJob(ENV_ID));
    expect(await pageCount(h.files.get(`${ENV_ID}/sealed.pdf`)!)).toBe(2);
  });

  it('flag on: certificate pages are appended before sign()', async () => {
    const h = makeHarness(
      sealingEnvelope(),
      EVENTS,
      new Map([[`${ENV_ID}/original.pdf`, await pdfWithPages(2)]]),
    );
    await withFlag('appendCertificate', true, () => h.svc.processSealJob(ENV_ID));

    const auditPages = await pageCount(h.files.get(`${ENV_ID}/audit.pdf`)!);
    expect(auditPages).toBeGreaterThan(0);
    // The signer saw original + certificate pages, so the seal covers them.
    expect(h.signer.inputs).toHaveLength(1);
    expect(await pageCount(h.signer.inputs[0]!)).toBe(2 + auditPages);
    expect(await pageCount(h.files.get(`${ENV_ID}/sealed.pdf`)!)).toBe(2 + auditPages);
  }, 120_000);
});

describe('SealingService — sign and B-LT/B-LTA in separate edge steps (S.9)', () => {
  it('audit_only: parks the signed declined.pdf, upgrades it next step, then drops the parked copy', async () => {
    const h = makeHarness(
      makeEnvelope({ id: ENV_ID, status: 'expired' }),
      EVENTS,
      new Map([[`${ENV_ID}/original.pdf`, await pdfWithPages(2)]]),
    );
    const parked = sealParkedSignedPath(ENV_ID, 1);

    const first = await h.svc.processAuditOnlyStep(ENV_ID, EMPTY_SEAL_PROGRESS);
    expect(first.done).toBe(false);
    const p1 = (first as { progress: SealProgress }).progress;
    expect(p1.pendingUpgrade).toEqual({ ord: 1, signedPath: parked, timestampApplied: true });
    expect(h.files.has(parked)).toBe(true);
    expect(h.files.has(declinedPdfPath(ENV_ID))).toBe(false);
    expect(h.signer.inputs).toHaveLength(1);
    expect(h.dssCalls).toHaveLength(0);

    const parkedBytes = h.files.get(parked)!;
    const second = await h.svc.processAuditOnlyStep(ENV_ID, p1);
    const p2 = (second as { progress: SealProgress }).progress;
    expect(p2.pendingUpgrade).toBeUndefined();
    expect(p2.declined).toEqual([1]);
    expect(h.signer.inputs).toHaveLength(1);
    expect(h.dssCalls).toEqual([parkedBytes]);
    expect(h.files.has(declinedPdfPath(ENV_ID))).toBe(true);
    expect(h.files.has(parked)).toBe(false);

    expect(await h.svc.processAuditOnlyStep(ENV_ID, p2)).toEqual({ done: true });
    expect(h.auditSet).toEqual([`${ENV_ID}/audit.pdf`]);
  });

  it('seal: the document step splits the same way; in one process it stays one step', async () => {
    const envelope = makeEnvelope({
      id: ENV_ID,
      status: 'sealing',
      signers: [makeSigner({ status: 'completed', signed_at: '2026-04-25T10:05:00.000Z' })],
      fields: [],
    });
    const seed = new Map([[`${ENV_ID}/original.pdf`, await pdfWithPages(2)]]);
    const parked = sealParkedSignedPath(ENV_ID, 1);

    const edge = makeHarness(envelope, EVENTS, seed);
    await withFlag('appendCertificate', false, async () => {
      const first = await edge.svc.processSealStep(ENV_ID, EMPTY_SEAL_PROGRESS);
      const p1 = (first as { progress: SealProgress }).progress;
      expect(p1.pendingUpgrade?.signedPath).toBe(parked);
      expect(p1.documents).toEqual([]);
      expect(edge.files.has(`${ENV_ID}/sealed.pdf`)).toBe(false);

      const second = await edge.svc.processSealStep(ENV_ID, p1);
      const p2 = (second as { progress: SealProgress }).progress;
      expect(p2.pendingUpgrade).toBeUndefined();
      expect(p2.documents.map((d) => d.ord)).toEqual([1]);
      expect(edge.dssCalls).toHaveLength(1);
      expect(edge.files.has(parked)).toBe(false);
      expect(await pageCount(edge.files.get(`${ENV_ID}/sealed.pdf`)!)).toBe(2);
    });

    const docker = makeHarness(envelope, EVENTS, seed);
    await withFlag('appendCertificate', false, () => docker.svc.processSealJob(ENV_ID));
    expect([...docker.files.keys()].some((k) => k.includes('/seal-work/'))).toBe(false);
    expect(docker.signer.inputs).toHaveLength(1);
    expect(docker.dssCalls).toHaveLength(1);
  });
});
