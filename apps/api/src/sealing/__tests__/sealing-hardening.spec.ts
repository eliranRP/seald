import { PDFDocument } from 'pdf-lib';
import type { FeatureFlag } from 'shared';
import type { AppEnv } from '../../config/env.schema';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { Envelope, EnvelopeEvent } from '../../envelopes/envelope.entity';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { makeEnvelope, makeEvent, makeSigner } from '../../../test/factories';
import type { DssInjector } from '../dss-injector';
import { PadesSigner, type PadesSignResult } from '../pades-signer';
import { SealingService } from '../sealing.service';

/**
 * WP-01 item 3: the optional pre-seal certificate appended inside
 * sealed.pdf (flag `appendCertificate`).
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
  const svc = new SealingService(repo, storage, {} as OutboundEmailsRepository, signer, dss, {
    APP_PUBLIC_URL: 'https://seald.example',
  } as AppEnv);
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
