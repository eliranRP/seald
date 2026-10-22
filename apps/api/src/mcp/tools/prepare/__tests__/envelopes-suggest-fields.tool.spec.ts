import { EnvelopesSuggestFieldsOutputSchema } from 'shared';
import {
  OTHER_OWNER,
  callWrite,
  draft,
  err,
  ok,
  resetFlags,
  setFlags,
  staged,
  write,
  writeWorld,
  type WriteWorld,
} from '../../__tests__/write-harness';

interface Suggested {
  signer_id: string;
  document_id?: string;
  kind: string;
  page: number;
  x: number;
  y: number;
  required: boolean;
}

async function build(w: WriteWorld, pages: number[], signerCount = 2) {
  const id = await draft(w);
  const docs: string[] = [];
  for (const p of pages) {
    const out = ok(
      await callWrite(
        w,
        'envelopes_add_document',
        write({ envelope_id: id, document_id: await staged(w, p) }),
      ),
    );
    docs.push((out['document'] as { id: string }).id);
  }
  const signers: string[] = [];
  for (let i = 0; i < signerCount; i++) {
    const s = ok(
      await callWrite(
        w,
        'envelopes_add_signer',
        write({ envelope_id: id, email: `s${i}@example.com`, name: `S${i}` }),
      ),
    );
    signers.push(s['id'] as string);
  }
  return { id, docs, signers };
}

const suggest = async (w: WriteWorld, args: Record<string, unknown>) =>
  ok(await callWrite(w, 'envelopes_suggest_fields', args));

const STRANGER = '12345678-1234-4234-8234-123456789012';

describe('envelopes_suggest_fields', () => {
  afterEach(() => resetFlags());

  it('is read-only and needs only envelopes:read', async () => {
    setFlags();
    const w = writeWorld();
    const { id } = await build(w, [2]);
    const result = await callWrite(
      w,
      'envelopes_suggest_fields',
      { envelope_id: id },
      { scopes: ['envelopes:read'] },
    );
    expect(result.isError).toBeUndefined();
  });

  it('suggests a signature and date per signer on the last page of the last document, initials elsewhere', async () => {
    setFlags();
    const w = writeWorld();
    const { id, docs, signers } = await build(w, [2, 1]);
    const out = await suggest(w, { envelope_id: id });
    expect(EnvelopesSuggestFieldsOutputSchema.safeParse(out).success).toBe(true);
    expect(out['note']).toBe('Suggestions only. Call envelopes_place_fields to save.');
    const fields = out['fields'] as Suggested[];
    const sigs = fields.filter((f) => f.kind === 'signature');
    expect(sigs.map((f) => [f.signer_id, f.document_id, f.page, f.x, f.y, f.required])).toEqual([
      [signers[0], docs[1], 1, 0.1, 0.78, true],
      [signers[1], docs[1], 1, 0.1, 0.7, true],
    ]);
    const dates = fields.filter((f) => f.kind === 'date');
    expect(dates).toHaveLength(2);
    expect(dates[0]).toMatchObject({ y: 0.78, document_id: docs[1] });
    expect(dates[0]?.x).toBeGreaterThan(0.38);
    const initials = fields.filter((f) => f.kind === 'initials');
    expect(initials).toHaveLength(4); // 2 signers x pages 1-2 of document 1
    expect(initials.every((f) => f.document_id === docs[0] && !f.required)).toBe(true);
  });

  it('writes nothing, and its output places cleanly', async () => {
    setFlags();
    const w = writeWorld();
    const { id } = await build(w, [3]);
    const out = await suggest(w, { envelope_id: id });
    const got = ok(await callWrite(w, 'envelopes_get', { envelope_id: id }));
    expect(got['fields']).toEqual([]);
    const placed = ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({ envelope_id: id, fields: out['fields'] }),
      ),
    );
    expect(placed['fields']).toHaveLength((out['fields'] as unknown[]).length);
  });

  it('honours signer_id and document_id', async () => {
    setFlags();
    const w = writeWorld();
    const { id, docs, signers } = await build(w, [1, 1]);
    const out = await suggest(w, { envelope_id: id, signer_id: signers[1], document_id: docs[0] });
    const fields = out['fields'] as Suggested[];
    expect(new Set(fields.map((f) => f.signer_id))).toEqual(new Set([signers[1]]));
    expect(fields.find((f) => f.kind === 'signature')).toMatchObject({
      document_id: docs[0],
      y: 0.78,
    });
    expect(fields.filter((f) => f.document_id === docs[1]).map((f) => f.kind)).toEqual([
      'initials',
    ]);
  });

  it('shifts clear of a field already placed, and drops what leaves the page', async () => {
    setFlags();
    const w = writeWorld();
    const { id, signers } = await build(w, [1], 1);
    ok(
      await callWrite(
        w,
        'envelopes_place_fields',
        write({
          envelope_id: id,
          fields: [
            {
              signer_id: signers[0],
              kind: 'text',
              page: 1,
              x: 0.1,
              y: 0.78,
              width: 0.28,
              height: 0.06,
            },
          ],
        }),
      ),
    );
    const fields = (await suggest(w, { envelope_id: id }))['fields'] as Suggested[];
    expect(fields.find((f) => f.kind === 'signature')?.y).toBeCloseTo(0.7);

    const many = await build(w, [1], 12);
    const stacked = (await suggest(w, { envelope_id: many.id }))['fields'] as Suggested[];
    const sigs = stacked.filter((f) => f.kind === 'signature');
    expect(sigs.length).toBeLessThan(12);
    expect(sigs.every((f) => f.y >= 0)).toBe(true);
  });

  it('omits document_id and meta with multiDocumentEnvelopes and fieldMetaV2 off', async () => {
    setFlags({ multiDocumentEnvelopes: false, fieldMetaV2: false });
    const w = writeWorld();
    const id = await draft(w);
    ok(
      await callWrite(
        w,
        'envelopes_upload_pdf',
        write({ envelope_id: id, document_id: await staged(w, 2) }),
      ),
    );
    ok(
      await callWrite(
        w,
        'envelopes_add_signer',
        write({ envelope_id: id, email: 'solo@example.com', name: 'Solo' }),
      ),
    );
    const fields = (await suggest(w, { envelope_id: id }))['fields'] as Suggested[];
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f).not.toHaveProperty('document_id');
      expect(f).not.toHaveProperty('meta');
    }
  });

  it('answers empty with a note when there is no PDF or no signer', async () => {
    setFlags();
    const w = writeWorld();
    const id = await draft(w);
    expect((await suggest(w, { envelope_id: id }))['fields']).toEqual([]);
    const withDoc = await build(w, [1], 0);
    const out = await suggest(w, { envelope_id: withDoc.id });
    expect(out['fields']).toEqual([]);
    expect(out['note']).toMatch(/signer/i);
  });

  it('refuses a signer or document from elsewhere, and another owner', async () => {
    setFlags();
    const w = writeWorld();
    const { id } = await build(w, [1], 1);
    const bySigner = await callWrite(w, 'envelopes_suggest_fields', {
      envelope_id: id,
      signer_id: STRANGER,
    });
    expect(err(bySigner).slug).toBe('signer_not_in_envelope');
    const byDoc = await callWrite(w, 'envelopes_suggest_fields', {
      envelope_id: id,
      document_id: STRANGER,
    });
    expect(err(byDoc).slug).toBe('document_not_in_envelope');
    const other = await callWrite(
      w,
      'envelopes_suggest_fields',
      { envelope_id: id },
      { owner: OTHER_OWNER },
    );
    expect(err(other).slug).toBe('envelope_not_found');
  });
});
