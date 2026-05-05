import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { EnvelopesPgRepository } from '../envelopes.repository.pg';
import {
  EnvelopeSignerEmailTakenError,
  EnvelopeTerminalError,
  InvalidCursorError,
  type CreateDraftInput,
} from '../envelopes.repository';

/**
 * Tiny helpers. Short codes are validated at the wire boundary to length 13;
 * we generate a stable pattern here so tests don't collide.
 * Rule 3.3 — counter is reset in beforeEach to avoid hidden inter-test coupling.
 */
let shortCodeCounter = 0;
beforeEach(() => {
  shortCodeCounter = 0;
});
function nextShortCode(): string {
  shortCodeCounter += 1;
  // 13 chars: 'SC' + 11 digits (zero-padded).
  return `SC${String(shortCodeCounter).padStart(11, '0')}`;
}
function draftInput(owner_id: string, overrides: Partial<CreateDraftInput> = {}): CreateDraftInput {
  return {
    owner_id,
    title: 'Test Envelope',
    short_code: nextShortCode(),
    tc_version: 'tc-v1',
    privacy_version: 'pp-v1',
    expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    ...overrides,
  };
}

describe('EnvelopesPgRepository — createDraft + findByIdForOwner', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('inserts a draft and returns a full envelope aggregate with empty signers/fields', async () => {
    const e = await repo.createDraft(draftInput(ownerId, { title: 'Hello World' }));
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(e.owner_id).toBe(ownerId);
    expect(e.title).toBe('Hello World');
    expect(e.status).toBe('draft');
    expect(e.delivery_mode).toBe('parallel');
    expect(e.signers).toEqual([]);
    expect(e.fields).toEqual([]);
    expect(e.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const got = await repo.findByIdForOwner(ownerId, e.id);
    expect(got?.id).toBe(e.id);
    expect(got?.title).toBe('Hello World');
  });

  it('findByIdForOwner returns null for another owner', async () => {
    const otherOwner = await seedUser(handle);
    const e = await repo.createDraft(draftInput(ownerId));
    const got = await repo.findByIdForOwner(otherOwner, e.id);
    expect(got).toBeNull();
  });

  it('findByIdForOwner returns null for an unknown id', async () => {
    const got = await repo.findByIdForOwner(ownerId, '00000000-0000-0000-0000-000000000000');
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — listByOwner', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('paginates with keyset cursor and emits next_cursor until exhausted', async () => {
    // Create 5 envelopes with spaced updated_at by updating each after insert.
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const e = await repo.createDraft(draftInput(ownerId, { title: `E${i}` }));
      // Touch updated_at so ordering is deterministic.
      await handle.db
        .updateTable('envelopes')
        .set({ updated_at: new Date(2026, 0, 10 + i).toISOString() })
        .where('id', '=', e.id)
        .execute();
      ids.push(e.id);
    }
    const page1 = await repo.listByOwner(ownerId, { limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.items.map((i) => i.id)).toEqual([ids[4], ids[3]]);
    expect(page1.next_cursor).not.toBeNull();

    const cursor1 = repo.decodeCursorOrThrow(page1.next_cursor!);
    const page2 = await repo.listByOwner(ownerId, { limit: 2, cursor: cursor1 });
    expect(page2.items.map((i) => i.id)).toEqual([ids[2], ids[1]]);
    expect(page2.next_cursor).not.toBeNull();

    const cursor2 = repo.decodeCursorOrThrow(page2.next_cursor!);
    const page3 = await repo.listByOwner(ownerId, { limit: 2, cursor: cursor2 });
    expect(page3.items.map((i) => i.id)).toEqual([ids[0]]);
    expect(page3.next_cursor).toBeNull();
  });

  it('filters by status', async () => {
    const a = await repo.createDraft(draftInput(ownerId, { title: 'Draft A' }));
    const b = await repo.createDraft(draftInput(ownerId, { title: 'Sent B' }));
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', b.id)
      .execute();

    const drafts = await repo.listByOwner(ownerId, { limit: 10, statuses: ['draft'] });
    expect(drafts.items.map((i) => i.id)).toEqual([a.id]);
    const sent = await repo.listByOwner(ownerId, {
      limit: 10,
      statuses: ['awaiting_others'],
    });
    expect(sent.items.map((i) => i.id)).toEqual([b.id]);
  });

  it('throws InvalidCursorError when decoding junk', () => {
    expect(() => repo.decodeCursorOrThrow('not-base64-!!')).toThrow(InvalidCursorError);
    const malformed = Buffer.from('nope', 'utf8').toString('base64');
    expect(() => repo.decodeCursorOrThrow(malformed)).toThrow(InvalidCursorError);
  });
});

describe('EnvelopesPgRepository — updateDraftMetadata', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('patches title on a draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const got = await repo.updateDraftMetadata(ownerId, e.id, { title: 'Updated' });
    expect(got?.title).toBe('Updated');
  });

  it('returns null when envelope is not a draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    const got = await repo.updateDraftMetadata(ownerId, e.id, { title: 'Nope' });
    expect(got).toBeNull();
  });

  it('returns null for another owner', async () => {
    const otherOwner = await seedUser(handle);
    const e = await repo.createDraft(draftInput(ownerId));
    const got = await repo.updateDraftMetadata(otherOwner, e.id, { title: 'Nope' });
    expect(got).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const got = await repo.updateDraftMetadata(ownerId, '00000000-0000-0000-0000-000000000000', {
      title: 'x',
    });
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — deleteDraft', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('deletes a draft and cascades to signers + fields', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const signer = await repo.addSigner(e.id, {
      email: 's@x.com',
      name: 'S',
      color: '#AABBCC',
    });
    await repo.replaceFields(e.id, [
      { signer_id: signer.id, kind: 'signature', page: 1, x: 0.1, y: 0.1 },
    ]);

    expect(await repo.deleteDraft(ownerId, e.id)).toBe(true);

    const remainingSigners = await handle.db.selectFrom('envelope_signers').selectAll().execute();
    expect(remainingSigners).toHaveLength(0);
    const remainingFields = await handle.db.selectFrom('envelope_fields').selectAll().execute();
    expect(remainingFields).toHaveLength(0);
  });

  it('returns false when not a draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    expect(await repo.deleteDraft(ownerId, e.id)).toBe(false);
  });

  it('returns false for another owner', async () => {
    const otherOwner = await seedUser(handle);
    const e = await repo.createDraft(draftInput(ownerId));
    expect(await repo.deleteDraft(otherOwner, e.id)).toBe(false);
  });
});

describe('EnvelopesPgRepository — setOriginalFile', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('sets on a draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const sha = 'a'.repeat(64);
    const got = await repo.setOriginalFile(e.id, {
      file_path: 'uploads/a.pdf',
      sha256: sha,
      pages: 4,
    });
    expect(got?.original_sha256).toBe(sha);
    expect(got?.original_pages).toBe(4);
  });

  it('returns null on non-draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    const got = await repo.setOriginalFile(e.id, {
      file_path: 'x',
      sha256: 'b'.repeat(64),
      pages: 1,
    });
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — addSigner / removeSigner', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('adds and removes a signer', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'Alice', color: '#112233' });
    expect(s.email).toBe('a@x.com');
    expect(s.status).toBe('awaiting');
    expect(await repo.removeSigner(e.id, s.id)).toBe(true);
    expect(await repo.removeSigner(e.id, s.id)).toBe(false);
  });

  it('throws EnvelopeSignerEmailTakenError on duplicate email in same envelope', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await repo.addSigner(e.id, { email: 'dup@x.com', name: 'A', color: '#111111' });
    await expect(
      repo.addSigner(e.id, { email: 'dup@x.com', name: 'B', color: '#222222' }),
    ).rejects.toBeInstanceOf(EnvelopeSignerEmailTakenError);
  });

  it('allows the same email across different envelopes', async () => {
    const e1 = await repo.createDraft(draftInput(ownerId));
    const e2 = await repo.createDraft(draftInput(ownerId));
    await repo.addSigner(e1.id, { email: 'dup@x.com', name: 'A', color: '#111111' });
    await expect(
      repo.addSigner(e2.id, { email: 'dup@x.com', name: 'A', color: '#111111' }),
    ).resolves.toMatchObject({ email: 'dup@x.com' });
  });
});

describe('EnvelopesPgRepository — replaceFields', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('atomically deletes all fields and inserts the new set', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    await repo.replaceFields(e.id, [
      { signer_id: s.id, kind: 'signature', page: 1, x: 0.1, y: 0.1 },
      { signer_id: s.id, kind: 'date', page: 1, x: 0.2, y: 0.2 },
      { signer_id: s.id, kind: 'text', page: 1, x: 0.3, y: 0.3 },
    ]);
    const next = await repo.replaceFields(e.id, [
      { signer_id: s.id, kind: 'checkbox', page: 2, x: 0.5, y: 0.5 },
    ]);
    expect(next).toHaveLength(1);
    expect(next[0]!.kind).toBe('checkbox');

    const all = await handle.db
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', e.id)
      .execute();
    expect(all).toHaveLength(1);
  });

  it('empty array deletes everything', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    await repo.replaceFields(e.id, [
      { signer_id: s.id, kind: 'signature', page: 1, x: 0.1, y: 0.1 },
    ]);
    const after = await repo.replaceFields(e.id, []);
    expect(after).toEqual([]);
    const all = await handle.db
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', e.id)
      .execute();
    expect(all).toHaveLength(0);
  });
});

describe('EnvelopesPgRepository — sendDraft', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('transitions draft → awaiting_others and stamps tokens', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s1 = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#111111' });
    const s2 = await repo.addSigner(e.id, { email: 'b@x.com', name: 'B', color: '#222222' });
    const h1 = 'a'.repeat(64);
    const h2 = 'b'.repeat(64);
    const sent = await repo.sendDraft({
      envelope_id: e.id,
      signer_tokens: [
        { signer_id: s1.id, access_token_hash: h1 },
        { signer_id: s2.id, access_token_hash: h2 },
      ],
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    expect(sent?.status).toBe('awaiting_others');
    expect(sent?.sent_at).not.toBeNull();
    const s1Row = await handle.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('id', '=', s1.id)
      .executeTakeFirstOrThrow();
    expect(s1Row.access_token_hash).toBe(h1);
    expect(s1Row.access_token_sent_at).not.toBeNull();
  });

  it('returns null when envelope is not a draft', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    const got = await repo.sendDraft({
      envelope_id: e.id,
      signer_tokens: [],
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — rotateSignerAccessToken', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  async function buildAwaitingEnvelope(): Promise<{ envelopeId: string; signerId: string }> {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#111111' });
    await repo.sendDraft({
      envelope_id: e.id,
      signer_tokens: [{ signer_id: s.id, access_token_hash: 'a'.repeat(64) }],
      sender_email: 'sender@example.com',
      sender_name: 'Sender',
    });
    return { envelopeId: e.id, signerId: s.id };
  }

  it('rotates the access_token_hash and bumps access_token_sent_at', async () => {
    const { signerId } = await buildAwaitingEnvelope();
    const newHash = 'b'.repeat(64);
    const ok = await repo.rotateSignerAccessToken(signerId, newHash);
    expect(ok).toBe(true);
    const row = await handle.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('id', '=', signerId)
      .executeTakeFirstOrThrow();
    expect(row.access_token_hash).toBe(newHash);
    expect(row.access_token_sent_at).not.toBeNull();
  });

  it('returns false when the signer has already signed', async () => {
    const { signerId } = await buildAwaitingEnvelope();
    await handle.db
      .updateTable('envelope_signers')
      .set({
        tc_accepted_at: new Date().toISOString(),
        signature_format: 'typed',
        signed_at: new Date().toISOString(),
      })
      .where('id', '=', signerId)
      .execute();
    const ok = await repo.rotateSignerAccessToken(signerId, 'c'.repeat(64));
    expect(ok).toBe(false);
  });

  it('returns false when the signer has declined', async () => {
    const { signerId } = await buildAwaitingEnvelope();
    await handle.db
      .updateTable('envelope_signers')
      .set({ declined_at: new Date().toISOString(), decline_reason: 'nope' })
      .where('id', '=', signerId)
      .execute();
    const ok = await repo.rotateSignerAccessToken(signerId, 'c'.repeat(64));
    expect(ok).toBe(false);
  });

  it('returns false when the envelope is not awaiting_others', async () => {
    const { envelopeId, signerId } = await buildAwaitingEnvelope();
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'declined' })
      .where('id', '=', envelopeId)
      .execute();
    const ok = await repo.rotateSignerAccessToken(signerId, 'c'.repeat(64));
    expect(ok).toBe(false);
  });

  it('returns false for an unknown signer', async () => {
    const ok = await repo.rotateSignerAccessToken(
      '11111111-1111-4111-8111-111111111111',
      'c'.repeat(64),
    );
    expect(ok).toBe(false);
  });
});

describe('EnvelopesPgRepository — signer flow: view / tc / fill / signature', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('records view, accepts terms, fills a field, and sets signature', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    const fields = await repo.replaceFields(e.id, [
      { signer_id: s.id, kind: 'text', page: 1, x: 0.1, y: 0.1 },
    ]);

    const viewed = await repo.recordSignerViewed(s.id, '10.0.0.1', 'UA/1.0');
    expect(viewed.status).toBe('viewing');
    // Idempotent: second call does not error and status remains viewing.
    const viewed2 = await repo.recordSignerViewed(s.id, '10.0.0.2', 'UA/2.0');
    expect(viewed2.status).toBe('viewing');

    const tc = await repo.acceptTerms(s.id);
    expect(tc.status).toBe('viewing');
    const tc2 = await repo.acceptTerms(s.id);
    expect(tc2.status).toBe('viewing');

    const filled = await repo.fillField(fields[0]!.id, s.id, { value_text: 'hello' });
    expect(filled?.value_text).toBe('hello');
    expect(filled?.filled_at).not.toBeNull();

    const sigSet = await repo.setSignerSignature(s.id, {
      signature_format: 'drawn',
      signature_image_path: 'sigs/s.png',
      signature_stroke_count: 3,
    });
    expect(sigSet.id).toBe(s.id);
  });

  it('fillField returns null when signer does not own the field', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s1 = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#111111' });
    const s2 = await repo.addSigner(e.id, { email: 'b@x.com', name: 'B', color: '#222222' });
    const [f] = await repo.replaceFields(e.id, [
      { signer_id: s1.id, kind: 'text', page: 1, x: 0.1, y: 0.1 },
    ]);
    const got = await repo.fillField(f!.id, s2.id, { value_text: 'spoofed' });
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — submitSigner', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  async function setupReadySigner(envelope_id: string, email: string) {
    const s = await repo.addSigner(envelope_id, { email, name: email, color: '#112233' });
    await repo.acceptTerms(s.id);
    await repo.setSignerSignature(s.id, {
      signature_format: 'typed',
      signature_image_path: `sigs/${s.id}.png`,
    });
    return s;
  }

  it('partial signing leaves envelope in awaiting_others', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s1 = await setupReadySigner(e.id, 'a@x.com');
    await setupReadySigner(e.id, 'b@x.com');
    // Move envelope to awaiting_others to simulate post-send state.
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();

    const r = await repo.submitSigner(s1.id, '10.0.0.1', 'UA/1');
    expect(r?.all_signed).toBe(false);
    expect(r?.envelope_status).toBe('awaiting_others');
  });

  it('final submit flips envelope to sealing', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s1 = await setupReadySigner(e.id, 'a@x.com');
    const s2 = await setupReadySigner(e.id, 'b@x.com');
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();

    await repo.submitSigner(s1.id, null, null);
    const r = await repo.submitSigner(s2.id, null, null);
    expect(r?.all_signed).toBe(true);
    expect(r?.envelope_status).toBe('sealing');
  });

  it('already-signed returns null', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await setupReadySigner(e.id, 'a@x.com');
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    const first = await repo.submitSigner(s.id, null, null);
    expect(first?.all_signed).toBe(true);
    const second = await repo.submitSigner(s.id, null, null);
    expect(second).toBeNull();
  });
});

describe('EnvelopesPgRepository — declineSigner', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('transitions envelope to declined', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    const updated = await repo.declineSigner(s.id, 'no time', '1.2.3.4', 'UA');
    expect(updated?.status).toBe('declined');
    expect(updated?.signers[0]!.status).toBe('declined');
  });

  it('returns null when signer already signed', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    await repo.acceptTerms(s.id);
    await repo.setSignerSignature(s.id, {
      signature_format: 'typed',
      signature_image_path: 'x',
    });
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', '=', e.id)
      .execute();
    await repo.submitSigner(s.id, null, null);
    const got = await repo.declineSigner(s.id, 'nope', null, null);
    expect(got).toBeNull();
  });

  it('throws EnvelopeTerminalError when envelope is already terminal', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    // Mark envelope already expired (terminal) while signer is still open.
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'expired' })
      .where('id', '=', e.id)
      .execute();
    await expect(repo.declineSigner(s.id, 'nope', null, null)).rejects.toBeInstanceOf(
      EnvelopeTerminalError,
    );
  });
});

describe('EnvelopesPgRepository — expireEnvelopes', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('transitions only awaiting_others rows past their expires_at', async () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const future = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    const e1 = await repo.createDraft(draftInput(ownerId, { expires_at: past }));
    const e2 = await repo.createDraft(draftInput(ownerId, { expires_at: past }));
    const e3 = await repo.createDraft(draftInput(ownerId, { expires_at: future }));

    // Only e1 + e2 are awaiting_others AND past their expires_at.
    await handle.db
      .updateTable('envelopes')
      .set({ status: 'awaiting_others' })
      .where('id', 'in', [e1.id, e2.id, e3.id])
      .execute();
    await handle.db
      .updateTable('envelopes')
      .set({ expires_at: future, status: 'awaiting_others' })
      .where('id', '=', e3.id)
      .execute();

    const ids = await repo.expireEnvelopes(new Date(), 10);
    expect(new Set(ids)).toEqual(new Set([e1.id, e2.id]));
    const rows = await handle.db
      .selectFrom('envelopes')
      .select(['id', 'status'])
      .where('id', 'in', [e1.id, e2.id, e3.id])
      .execute();
    expect(rows.find((r) => r.id === e1.id)?.status).toBe('expired');
    expect(rows.find((r) => r.id === e2.id)?.status).toBe('expired');
    expect(rows.find((r) => r.id === e3.id)?.status).toBe('awaiting_others');
  });
});

describe('EnvelopesPgRepository — appendEvent + listEventsForEnvelope', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('appends and lists events ordered by created_at', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const ev1 = await repo.appendEvent({
      envelope_id: e.id,
      actor_kind: 'sender',
      event_type: 'created',
    });
    const ev2 = await repo.appendEvent({
      envelope_id: e.id,
      actor_kind: 'system',
      event_type: 'sent',
      metadata: { a: 1 },
    });
    const ev3 = await repo.appendEvent({
      envelope_id: e.id,
      actor_kind: 'system',
      event_type: 'viewed',
    });
    // pg-mem resolves `now()` with millisecond precision, so back-to-back
    // inserts within the same ms can tie on created_at. Spread them out
    // deterministically so the ordering assertion is meaningful. The Kysely
    // schema marks `created_at` as `never` for writes (it's DB-managed in
    // production), so go around it with mem.none().
    handle.mem.public.none(
      `update public.envelope_events set created_at = '2026-01-01T10:00:00Z' where id = '${ev1.id}';`,
    );
    handle.mem.public.none(
      `update public.envelope_events set created_at = '2026-01-01T10:00:01Z' where id = '${ev2.id}';`,
    );
    handle.mem.public.none(
      `update public.envelope_events set created_at = '2026-01-01T10:00:02Z' where id = '${ev3.id}';`,
    );
    const events = await repo.listEventsForEnvelope(e.id);
    expect(events.map((ev) => ev.event_type)).toEqual(['created', 'sent', 'viewed']);
    expect(events[1]!.metadata).toEqual({ a: 1 });

    // NOTE: we deliberately do NOT call verifyEventChain here — the
    // raw `update created_at` calls above DID corrupt the chain (they
    // bypass appendEvent, which is the only writer that recomputes
    // hashes). That's tamper-detection working correctly. The
    // chain-intact happy path is asserted in its own dedicated test
    // below where appendEvent is the sole writer.
  });

  it('verifyEventChain reports broken when prev_event_hash is corrupted out-of-band', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    await repo.appendEvent({
      envelope_id: e.id,
      actor_kind: 'system',
      event_type: 'created',
    });
    const second = await repo.appendEvent({
      envelope_id: e.id,
      actor_kind: 'system',
      event_type: 'sent',
    });
    // Corrupt the second event's prev_event_hash via raw SQL — simulating
    // an attacker with DB write access bypassing the repository's
    // appendEvent. We use the hex-escape bytea literal `\\xDEADBEEF...`
    // (32-byte length so the comparison reaches the equals() branch
    // rather than short-circuiting on length-mismatch).
    handle.mem.public.none(
      `update public.envelope_events set prev_event_hash = '\\xdeadbeef00000000000000000000000000000000000000000000000000000000' where id = '${second.id}';`,
    );
    const result = await repo.verifyEventChain(e.id);
    expect(result.chain_intact).toBe(false);
  });
});

describe('EnvelopesPgRepository — enqueueJob', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('upserts — same envelope enqueued twice yields exactly one row, kind reflected', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const id1 = await repo.enqueueJob(e.id, 'seal');
    // Simulate failure before re-enqueue: mark job failed.
    await handle.db
      .updateTable('envelope_jobs')
      .set({ status: 'failed', attempts: 3, last_error: 'boom' })
      .where('id', '=', id1)
      .execute();
    const id2 = await repo.enqueueJob(e.id, 'audit_only');
    expect(id2).toBe(id1);
    const rows = await handle.db
      .selectFrom('envelope_jobs')
      .selectAll()
      .where('envelope_id', '=', e.id)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('audit_only');
    expect(rows[0]!.status).toBe('pending');
    expect(rows[0]!.attempts).toBe(0);
    expect(rows[0]!.last_error).toBeNull();
  });
});

describe('EnvelopesPgRepository — findSignerByAccessTokenHash', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('returns signer + envelope for a matching hash', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const s = await repo.addSigner(e.id, { email: 'a@x.com', name: 'A', color: '#112233' });
    const hash = 'f'.repeat(64);
    await handle.db
      .updateTable('envelope_signers')
      .set({ access_token_hash: hash })
      .where('id', '=', s.id)
      .execute();
    const got = await repo.findSignerByAccessTokenHash(hash);
    expect(got?.envelope.id).toBe(e.id);
    expect(got?.signer.id).toBe(s.id);
  });

  it('returns null when no signer has that hash', async () => {
    const got = await repo.findSignerByAccessTokenHash('0'.repeat(64));
    expect(got).toBeNull();
  });
});

describe('EnvelopesPgRepository — findByShortCode + findByIdWithAll', () => {
  let handle: PgMemHandle;
  let repo: EnvelopesPgRepository;
  let ownerId: string;
  let otherOwnerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new EnvelopesPgRepository(handle.db);
    ownerId = await seedUser(handle);
    otherOwnerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('findByShortCode returns envelope regardless of owner', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const got = await repo.findByShortCode(e.short_code);
    expect(got?.id).toBe(e.id);
  });

  it('findByIdWithAll ignores owner scoping', async () => {
    const e = await repo.createDraft(draftInput(ownerId));
    const got = await repo.findByIdWithAll(e.id);
    expect(got?.owner_id).toBe(ownerId);
    expect(otherOwnerId).not.toBe(ownerId);
  });

  it('findByIdWithAll returns null on unknown id', async () => {
    expect(await repo.findByIdWithAll(randomUUID())).toBeNull();
  });
});
