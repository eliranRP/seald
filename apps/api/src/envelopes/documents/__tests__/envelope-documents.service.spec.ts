import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { MAX_ENVELOPE_DOCUMENTS } from 'shared';
import { InMemoryEnvelopeDocumentsRepository } from '../../../../test/in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from '../../../../test/in-memory-envelopes-repository';
import { InMemoryStorageService } from '../../../../test/in-memory-storage';
import type { StorageService } from '../../../storage/storage.service';
import { EnvelopeDocumentsService, titleFromFilename } from '../envelope-documents.service';

const OWNER = '00000000-0000-0000-0000-0000000000aa';
const OTHER = '00000000-0000-0000-0000-0000000000bb';

async function pdf(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

function setup() {
  const envelopes = new InMemoryEnvelopesRepository();
  const docs = new InMemoryEnvelopeDocumentsRepository(envelopes);
  const storage = new InMemoryStorageService();
  const svc = new EnvelopeDocumentsService(envelopes, docs, storage as unknown as StorageService);
  return { envelopes, docs, storage, svc };
}

async function draft(envelopes: InMemoryEnvelopesRepository): Promise<string> {
  const env = await envelopes.createDraft({
    owner_id: OWNER,
    title: 'Lease',
    short_code: `SC${randomUUID().replace(/-/g, '').slice(0, 11)}`,
    tc_version: 'tc',
    privacy_version: 'pp',
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  return env.id;
}

describe('EnvelopeDocumentsService', () => {
  it('fills document 1 at the legacy path first, then appends, with a document_added event each', async () => {
    const { envelopes, storage, svc } = setup();
    const id = await draft(envelopes);
    const one = await pdf(2);
    const two = await pdf(1);

    const first = await svc.add(OWNER, id, one, 'Main');
    expect(first).toMatchObject({ ord: 1, title: 'Main', original_pages: 2 });
    expect(storage.get(`${id}/original.pdf`)?.bytes.equals(one)).toBe(true);
    expect(envelopes.envelopes.get(id)!.original_sha256).toBe(
      createHash('sha256').update(one).digest('hex'),
    );

    const second = await svc.add(OWNER, id, two, null);
    expect(second).toMatchObject({ ord: 2, title: 'Document 2', original_pages: 1 });
    expect(storage.get(`${id}/documents/${second.id}/original.pdf`)?.bytes.equals(two)).toBe(true);
    // Document 1 is still what the legacy envelope fields describe.
    expect(envelopes.envelopes.get(id)!.original_pages).toBe(2);

    const added = envelopes.events.filter((e) => e.event_type === 'document_added');
    expect(added.map((e) => e.metadata['document_id'])).toEqual([first.id, second.id]);
    expect((await envelopes.verifyEventChain(id)).chain_intact).toBe(true);
  });

  it('rejects other owners, non-drafts and the document cap', async () => {
    const { envelopes, svc } = setup();
    const id = await draft(envelopes);
    const bytes = await pdf(1);
    await expect(svc.add(OTHER, id, bytes, null)).rejects.toMatchObject({
      message: 'envelope_not_found',
    });
    for (let i = 0; i < MAX_ENVELOPE_DOCUMENTS; i++) await svc.add(OWNER, id, bytes, null);
    await expect(svc.add(OWNER, id, bytes, null)).rejects.toMatchObject({
      message: 'too_many_documents',
    });
    envelopes.envelopes.set(id, { ...envelopes.envelopes.get(id)!, status: 'awaiting_others' });
    await expect(svc.add(OWNER, id, bytes, null)).rejects.toMatchObject({
      message: 'envelope_not_draft',
    });
  });

  it('rejects a non-PDF before touching storage', async () => {
    const { envelopes, storage, svc } = setup();
    const id = await draft(envelopes);
    await expect(svc.add(OWNER, id, Buffer.from('hello world'), null)).rejects.toMatchObject({
      message: 'file_not_pdf',
    });
    expect(storage.get(`${id}/original.pdf`)).toBeUndefined();
  });

  it('reorder needs every document exactly once', async () => {
    const { envelopes, svc } = setup();
    const id = await draft(envelopes);
    const a = await svc.add(OWNER, id, await pdf(1), 'A');
    const b = await svc.add(OWNER, id, await pdf(3), 'B');
    await expect(svc.reorder(OWNER, id, [a.id])).rejects.toMatchObject({
      message: 'document_order_invalid',
    });
    await expect(svc.reorder(OWNER, id, [a.id, a.id])).rejects.toMatchObject({
      message: 'document_order_invalid',
    });
    await expect(svc.reorder(OWNER, id, [a.id, randomUUID()])).rejects.toMatchObject({
      message: 'document_order_invalid',
    });
    const next = await svc.reorder(OWNER, id, [b.id, a.id]);
    expect(next.map((d) => [d.title, d.ord])).toEqual([
      ['B', 1],
      ['A', 2],
    ]);
    expect(envelopes.envelopes.get(id)!.original_pages).toBe(3);
  });

  it('remove keeps at least one document and deletes the stored PDF', async () => {
    const { envelopes, storage, svc } = setup();
    const id = await draft(envelopes);
    const a = await svc.add(OWNER, id, await pdf(1), 'A');
    await expect(svc.remove(OWNER, id, a.id)).rejects.toMatchObject({ message: 'last_document' });
    const b = await svc.add(OWNER, id, await pdf(1), 'B');
    await svc.remove(OWNER, id, b.id);
    expect(storage.get(`${id}/documents/${b.id}/original.pdf`)).toBeUndefined();
    expect((await svc.list(OWNER, id)).map((d) => d.id)).toEqual([a.id]);
    await expect(svc.remove(OWNER, id, b.id)).rejects.toMatchObject({
      message: 'document_not_found',
    });
  });

  it('checks field document ids and decorates fields, defaulting to document 1', async () => {
    const { envelopes, svc } = setup();
    const id = await draft(envelopes);
    const a = await svc.add(OWNER, id, await pdf(1), 'A');
    const b = await svc.add(OWNER, id, await pdf(1), 'B');
    const signer = await envelopes.addSigner(id, {
      email: 's@example.com',
      name: 'S',
      color: '#112233',
    });
    const base = { signer_id: signer.id, kind: 'signature' as const, page: 1, x: 0.1, y: 0.1 };
    await expect(
      svc.assertFieldDocuments(id, [{ ...base, document_id: randomUUID() }]),
    ).rejects.toMatchObject({ message: 'document_not_in_envelope' });
    await svc.assertFieldDocuments(id, [base, { ...base, document_id: b.id }]);
    const fields = await envelopes.replaceFields(id, [base, { ...base, document_id: b.id }]);
    const decorated = await svc.decorateFields(id, fields);
    expect(decorated.map((f) => f.document_id)).toEqual([a.id, b.id]);
    const envelope = await svc.decorateEnvelope(envelopes.envelopes.get(id)!);
    expect(envelope.documents?.map((d) => d.id)).toEqual([a.id, b.id]);
  });

  it('serves per-document downloads and refuses a zip before sealing', async () => {
    const { envelopes, svc } = setup();
    const id = await draft(envelopes);
    const a = await svc.add(OWNER, id, await pdf(1), 'A');
    const original = await svc.downloadUrl(OWNER, id, { document_id: a.id });
    expect(original).toMatchObject({ kind: 'original', document_id: a.id });
    await expect(
      svc.downloadUrl(OWNER, id, { document_id: a.id, kind: 'sealed' }),
    ).rejects.toMatchObject({ message: 'file_not_ready' });
    await expect(svc.downloadUrl(OWNER, id, { kind: 'zip' })).rejects.toMatchObject({
      message: 'file_not_ready',
    });
    await expect(svc.downloadUrl(OWNER, id, { document_id: randomUUID() })).rejects.toMatchObject({
      message: 'document_not_found',
    });
  });

  it('derives a title from the upload file name', () => {
    expect(titleFromFilename('Lease 2026.PDF')).toBe('Lease 2026');
    expect(titleFromFilename('   .pdf')).toBeNull();
    expect(titleFromFilename(undefined)).toBeNull();
    expect(titleFromFilename(`${'x'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});
