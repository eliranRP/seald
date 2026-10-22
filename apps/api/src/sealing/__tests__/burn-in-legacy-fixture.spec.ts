import { createHash } from 'node:crypto';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { Envelope } from '../../envelopes/envelope.entity';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { makeEnvelope, makeField, makeSigner } from '../../../test/factories';
import type { DssInjector } from '../dss-injector';
import { NoopPadesSigner } from '../pades-signer';
import { SealingService } from '../sealing.service';

/**
 * WP-03 acceptance: legacy (single-document) envelopes seal unchanged.
 *
 * The SHA-256 below was recorded by running this spec against the
 * burn-in code BEFORE the multi-document loop landed. The fixture is
 * fully deterministic: a fixed clock (pdf-lib stamps CreationDate and
 * ModDate from `Date.now()`), a hand-built original PDF, and no signer
 * images (so no PNG encoder output enters the bytes). If this hash
 * changes, the burn-in of every legacy envelope changed with it.
 */
const LEGACY_BURN_IN_SHA256 = '7b08567eec3049015fb2e48437441afdc4f1b7b379cb787bef586331342b80b4';

const ENV_ID = '00000000-0000-0000-0000-000000000001';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000aa';
const FIXED_NOW = new Date('2026-01-02T03:04:05.000Z');

type BurnInFn = (envelope: Envelope, originalBytes: Buffer) => Promise<Buffer>;

async function fixtureOriginal(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Fixture page ${i + 1}`, { x: 72, y: 720, size: 14, font });
  }
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}

function fixtureEnvelope(): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    title: 'Legacy burn-in fixture',
    status: 'sealing',
    signers: [
      makeSigner({ id: SIGNER_ID, status: 'completed', signed_at: FIXED_NOW.toISOString() }),
    ],
    fields: [
      makeField({
        id: '00000000-0000-0000-0000-00000000f001',
        signer_id: SIGNER_ID,
        kind: 'text',
        page: 1,
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.04,
        value_text: 'Ada Lovelace',
      }),
      makeField({
        id: '00000000-0000-0000-0000-00000000f002',
        signer_id: SIGNER_ID,
        kind: 'date',
        page: 2,
        x: 0.5,
        y: 0.6,
        width: 0.2,
        height: 0.03,
        value_text: '2026-01-02',
      }),
      makeField({
        id: '00000000-0000-0000-0000-00000000f003',
        signer_id: SIGNER_ID,
        kind: 'checkbox',
        page: 2,
        x: 0.1,
        y: 0.8,
        width: 0.03,
        height: 0.03,
        value_boolean: true,
      }),
    ],
  });
}

function makeService(): SealingService {
  const storage: Pick<StorageService, 'download' | 'upload'> = {
    async download(path: string): Promise<Buffer> {
      throw new Error(`not_found:${path}`);
    },
    async upload(): Promise<void> {},
  };
  const ctorArgs: unknown[] = [
    {} as EnvelopesRepository,
    storage as StorageService,
    {} as OutboundEmailsRepository,
    new NoopPadesSigner(),
    { upgradeToBLt: async (b: Buffer) => b } as unknown as DssInjector,
    { APP_PUBLIC_URL: 'http://localhost' } as AppEnv,
    {},
  ];
  const Ctor = SealingService as unknown as new (...args: unknown[]) => SealingService;
  return new Ctor(...ctorArgs);
}

describe('legacy burn-in fixture (WP-03 byte-compare)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: FIXED_NOW, doNotFake: ['nextTick', 'setImmediate'] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('burns a single-document envelope to the same bytes as before multi-document sealing', async () => {
    const svc = makeService();
    const burnIn = (svc as unknown as { burnIn: BurnInFn }).burnIn.bind(svc);
    const out = await burnIn(fixtureEnvelope(), await fixtureOriginal());
    const hash = createHash('sha256').update(out).digest('hex');
    expect(hash).toBe(LEGACY_BURN_IN_SHA256);
  });
});
