import { PDFDocument } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import { makeEnvelope } from '../../../test/factories';
import { buildAuditPdf } from '../audit-pdf';
import type { AuditPdfInput } from '../audit-pdf';
import { NoopPadesSigner, PadesSigner, type PadesSignResult } from '../pades-signer';
import { SealingService } from '../sealing.service';

jest.mock('../audit-pdf', () => ({
  buildAuditPdf: jest.fn(async () => Buffer.from('%PDF-1.4\n')),
}));

/**
 * SealingService must forward the signer's own seal and timestamp flags.
 * A non-Noop signer with `appliesCmsSeal: false` fails if the service
 * still infers the flag with `instanceof NoopPadesSigner` or hard-codes it.
 */

class ReportingSigner extends PadesSigner {
  readonly appliesCmsSeal: boolean;

  constructor(
    appliesCmsSeal: boolean,
    private readonly timestamped: boolean,
  ) {
    super();
    this.appliesCmsSeal = appliesCmsSeal;
  }

  async sign(pdf: Buffer): Promise<PadesSignResult> {
    return { pdf, timestampApplied: this.timestamped };
  }
}

const buildAuditPdfMock = buildAuditPdf as jest.MockedFunction<typeof buildAuditPdf>;

async function onePagePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

function serviceFor(signer: PadesSigner, original: Buffer): SealingService {
  const envelope = makeEnvelope({ status: 'sealing', signers: [], fields: [], tags: [] });
  const storage = {
    download: async (path: string) => {
      if (path !== `${envelope.id}/original.pdf`) throw new Error(`not_found:${path}`);
      return original;
    },
    upload: async () => undefined,
  };
  const repo = {
    findByIdWithAll: async () => envelope,
    listEventsForEnvelope: async () => [],
    listSignerAuditDetails: async () => [],
    transitionToSealed: async () => null,
    setAuditFile: async () => undefined,
    appendEvent: async () => undefined,
  };
  return new SealingService(
    repo as unknown as EnvelopesRepository,
    storage as unknown as StorageService,
    {} as OutboundEmailsRepository,
    signer,
    {
      upgradeToBLt: async (bytes: Buffer) => bytes,
    } as unknown as import('../dss-injector').DssInjector,
    { APP_PUBLIC_URL: 'https://seald.example' } as AppEnv,
  );
}

async function sealInput(signer: PadesSigner): Promise<AuditPdfInput> {
  buildAuditPdfMock.mockClear();
  const svc = serviceFor(signer, await onePagePdf());
  await svc.processSealJob(makeEnvelope().id);
  const input = buildAuditPdfMock.mock.calls[0]?.[0];
  if (!input) throw new Error('buildAuditPdf was not called');
  return input;
}

describe('SealingService cmsSealApplied', () => {
  it('forwards NoopPadesSigner appliesCmsSeal false', async () => {
    const signer = new NoopPadesSigner();
    const input = await sealInput(signer);
    expect(signer.appliesCmsSeal).toBe(false);
    expect(input.cmsSealApplied).toBe(signer.appliesCmsSeal);
    expect(input.timestampApplied).toBe(false);
  });

  it('forwards a non-Noop signer that reports appliesCmsSeal false', async () => {
    const signer = new ReportingSigner(false, false);
    expect(signer).not.toBeInstanceOf(NoopPadesSigner);
    const input = await sealInput(signer);
    expect(input.cmsSealApplied).toBe(false);
    expect(input.timestampApplied).toBe(false);
  });

  it('forwards appliesCmsSeal true and the timestamp flag from the signer', async () => {
    const timestamped = new ReportingSigner(true, true);
    const untimestamped = new ReportingSigner(true, false);
    const withTimestamp = await sealInput(timestamped);
    const withoutTimestamp = await sealInput(untimestamped);
    expect(withTimestamp.cmsSealApplied).toBe(true);
    expect(withTimestamp.timestampApplied).toBe(true);
    expect(withoutTimestamp.cmsSealApplied).toBe(true);
    expect(withoutTimestamp.timestampApplied).toBe(false);
  });

  it('passes cmsSealApplied false on audit-only jobs', async () => {
    const signer = new ReportingSigner(true, true);
    buildAuditPdfMock.mockClear();
    const svc = serviceFor(signer, await onePagePdf());
    await svc.processAuditOnlyJob(makeEnvelope().id);
    const input = buildAuditPdfMock.mock.calls[0]?.[0];
    expect(input?.cmsSealApplied).toBe(false);
    expect(input?.timestampApplied).toBe(false);
  });
});
