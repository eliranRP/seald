import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { FeatureFlag } from 'shared';
import { InMemoryEnvelopeDocumentsRepository } from '../../../test/in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from '../../../test/in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import { InMemoryStorageService } from '../../../test/in-memory-storage';
import type { AppEnv } from '../../config/env.schema';
import type { EnvelopeField } from '../../envelopes/envelope.entity';
import type { StorageService } from '../../storage/storage.service';
import type { DssInjector } from '../dss-injector';
import { NoopPadesSigner } from '../pades-signer';
import { SealingService } from '../sealing.service';

/**
 * WP-03 sealing loop: each document is burned in with only its own
 * fields, signed and upgraded separately, stored at its own path, and
 * recorded on its document row. The legacy envelope columns describe
 * document 1.
 */
async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([300, 300]);
  return Buffer.from(await doc.save({ useObjectStreams: false }));
}
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');

// These specs render real PDFs (React-PDF + pdf-lib), which takes several
// seconds per case on a loaded runner; jest's 5 s default times them out.
jest.setTimeout(30_000);

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

afterEach(() => {
  delete host.__SEALD_FEATURE_OVERRIDES__;
});

describe('SealingService — multi-document envelopes', () => {
  it.each([false, true])(
    'seals every document with its own fields and records each sealed hash (appendCertificate %s)',
    async (appendCertificate) => {
      host.__SEALD_FEATURE_OVERRIDES__ = { appendCertificate };
      const envelopes = new InMemoryEnvelopesRepository();
      const docs = new InMemoryEnvelopeDocumentsRepository(envelopes);
      const storage = new InMemoryStorageService();
      const env = await envelopes.createDraft({
        owner_id: '00000000-0000-0000-0000-0000000000aa',
        title: 'Bundle',
        short_code: 'MULTIDOC00001',
        tc_version: 'tc',
        privacy_version: 'pp',
        expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      });
      const one = await pdf(2);
      const two = await pdf(1);
      await storage.upload(`${env.id}/original.pdf`, one, 'application/pdf');
      await envelopes.setOriginalFile(env.id, {
        file_path: `${env.id}/original.pdf`,
        sha256: sha(one),
        pages: 2,
      });
      const docBId = randomUUID();
      await storage.upload(`${env.id}/documents/${docBId}/original.pdf`, two, 'application/pdf');
      await docs.insertDocument({
        id: docBId,
        envelope_id: env.id,
        title: 'Annex',
        original_file_path: `${env.id}/documents/${docBId}/original.pdf`,
        original_sha256: sha(two),
        original_pages: 1,
        max_documents: 10,
      });
      const signer = await envelopes.addSigner(env.id, {
        email: 's@example.com',
        name: 'S',
        color: '#112233',
      });
      const base = { signer_id: signer.id, kind: 'text' as const, page: 1, x: 0.1, y: 0.1 };
      const [onA, onB] = await envelopes.replaceFields(env.id, [
        base,
        { ...base, document_id: docBId },
      ]);
      envelopes.envelopes.set(env.id, { ...envelopes.envelopes.get(env.id)!, status: 'sealing' });

      const svc = new SealingService(
        envelopes,
        storage as unknown as StorageService,
        new InMemoryOutboundEmailsRepository(),
        new NoopPadesSigner(),
        { upgradeToBLt: async (b: Buffer) => b } as unknown as DssInjector,
        { APP_PUBLIC_URL: 'https://seald.example' } as AppEnv,
        docs,
      );
      const burnIn = jest.spyOn(
        SealingService.prototype as unknown as {
          burnIn: (e: unknown, b: Buffer, f: ReadonlyArray<EnvelopeField>) => Promise<Buffer>;
        },
        'burnIn',
      );

      await svc.processSealJob(env.id);

      expect(burnIn).toHaveBeenCalledTimes(2);
      expect(burnIn.mock.calls.map((c) => c[2].map((f) => f.id))).toEqual([[onA!.id], [onB!.id]]);

      const sealedA = storage.get(`${env.id}/sealed.pdf`)!.bytes;
      const sealedB = storage.get(`${env.id}/documents/${docBId}/sealed.pdf`)!.bytes;
      const pagesA = (await PDFDocument.load(sealedA)).getPageCount();
      const pagesB = (await PDFDocument.load(sealedB)).getPageCount();
      if (appendCertificate) {
        // The same certificate pages go after the original pages of every
        // document (S.8 + appendCertificate).
        const certPages = pagesA - 2;
        expect(certPages).toBeGreaterThan(0);
        expect(pagesB - 1).toBe(certPages);
      } else {
        expect(pagesA).toBe(2);
        expect(pagesB).toBe(1);
      }

      const rows = await docs.listByEnvelope(env.id);
      expect(rows.map((d) => [d.ord, d.sealed_sha256])).toEqual([
        [1, sha(sealedA)],
        [2, sha(sealedB)],
      ]);
      const done = envelopes.envelopes.get(env.id)!;
      expect(done.status).toBe('completed');
      expect(done.sealed_sha256).toBe(sha(sealedA));
      expect(storage.get(`${env.id}/audit.pdf`)).toBeDefined();
    },
  );

  it('seals an envelope with no document rows as one legacy document', async () => {
    const envelopes = new InMemoryEnvelopesRepository();
    const storage = new InMemoryStorageService();
    const env = await envelopes.createDraft({
      owner_id: '00000000-0000-0000-0000-0000000000aa',
      title: 'Legacy',
      short_code: 'LEGACYDOC0001',
      tc_version: 'tc',
      privacy_version: 'pp',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const one = await pdf(1);
    await storage.upload(`${env.id}/original.pdf`, one, 'application/pdf');
    envelopes.envelopes.set(env.id, {
      ...envelopes.envelopes.get(env.id)!,
      status: 'sealing',
      original_sha256: sha(one),
      original_pages: 1,
    });
    const svc = new SealingService(
      envelopes,
      storage as unknown as StorageService,
      new InMemoryOutboundEmailsRepository(),
      new NoopPadesSigner(),
      { upgradeToBLt: async (b: Buffer) => b } as unknown as DssInjector,
      { APP_PUBLIC_URL: 'https://seald.example' } as AppEnv,
      new InMemoryEnvelopeDocumentsRepository(),
    );
    await svc.processSealJob(env.id);
    expect(storage.get(`${env.id}/sealed.pdf`)).toBeDefined();
    expect(envelopes.envelopes.get(env.id)!.status).toBe('completed');
  });
});
