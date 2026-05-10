import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AppEnv } from '../../config/env.schema';
import type { Contact } from '../../contacts/contact.entity';
import {
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from '../../contacts/contacts.repository';
import {
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
} from '../../email/outbound-emails.repository';
import { makeEnvelope } from '../../../test/factories';
import { SigningTokenService } from '../../signing/signing-token.service';
import { StorageService } from '../../storage/storage.service';
import type {
  AddSignerInput,
  CreateDraftInput,
  CreateFieldInput,
  EventInput,
  ListOptions,
  ListResult,
  SetOriginalFileInput,
  SetSignerSignatureInput,
  SignerFieldFillInput,
  SubmitResult,
  UpdateDraftMetadataPatch,
  Envelope,
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
} from '../envelopes.repository';
import {
  EnvelopeSignerEmailTakenError,
  EnvelopesRepository,
  InvalidCursorError,
  ShortCodeCollisionError,
} from '../envelopes.repository';
import { eventHash } from '../event-hash';
import { EnvelopesService } from '../envelopes.service';

class FakeContactsRepo extends ContactsRepository {
  store = new Map<string, Contact>();
  async create(input: CreateContactInput): Promise<Contact> {
    const now = new Date().toISOString();
    const c: Contact = {
      id: `c_${this.store.size + 1}`,
      owner_id: input.owner_id,
      name: input.name,
      email: input.email,
      color: input.color,
      created_at: now,
      updated_at: now,
    };
    this.store.set(c.id, c);
    return c;
  }
  async findAllByOwner(owner_id: string) {
    return [...this.store.values()].filter((c) => c.owner_id === owner_id);
  }
  async findOneByOwner(owner_id: string, id: string) {
    const c = this.store.get(id);
    return c && c.owner_id === owner_id ? c : null;
  }
  async update(owner_id: string, id: string, patch: UpdateContactPatch) {
    const c = await this.findOneByOwner(owner_id, id);
    if (!c) return null;
    const next: Contact = { ...c, ...patch, updated_at: new Date().toISOString() };
    this.store.set(id, next);
    return next;
  }
  async delete(owner_id: string, id: string) {
    const c = await this.findOneByOwner(owner_id, id);
    if (!c) return false;
    this.store.delete(id);
    return true;
  }
  async deleteAllByOwner(owner_id: string): Promise<number> {
    let n = 0;
    for (const [id, c] of [...this.store]) {
      if (c.owner_id === owner_id) {
        this.store.delete(id);
        n++;
      }
    }
    return n;
  }
}

/**
 * Minimal FakeEnvelopesRepo covering only what the sender service exercises.
 * Methods not used by EnvelopesService throw — they'll be fleshed out in the
 * Phase 3c signer service and Task 11 e2e fixture.
 */
class FakeEnvelopesRepo extends EnvelopesRepository {
  envelopes = new Map<string, Envelope>();
  events: EnvelopeEvent[] = [];
  shortCodesSeen = new Set<string>();
  throwShortCodeCollisionNTimes = 0;

  async createDraft(input: CreateDraftInput): Promise<Envelope> {
    if (this.throwShortCodeCollisionNTimes > 0) {
      this.throwShortCodeCollisionNTimes--;
      throw new ShortCodeCollisionError();
    }
    if (this.shortCodesSeen.has(input.short_code)) {
      throw new ShortCodeCollisionError();
    }
    this.shortCodesSeen.add(input.short_code);
    const now = new Date().toISOString();
    // Rule 11.1 — assemble the draft via the shared factory and override
    // only the fields the spec controls (id, owner, draft-specific
    // metadata). This keeps the per-spec story explicit while removing
    // ~15 lines of duplicated boilerplate.
    const env: Envelope = makeEnvelope({
      id: `e_${this.envelopes.size + 1}`,
      owner_id: input.owner_id,
      title: input.title,
      short_code: input.short_code,
      status: 'draft',
      original_pages: null,
      sender_email: null,
      sender_name: null,
      sent_at: null,
      expires_at: input.expires_at,
      tc_version: input.tc_version,
      privacy_version: input.privacy_version,
      created_at: now,
      updated_at: now,
    });
    this.envelopes.set(env.id, env);
    return env;
  }

  async findByIdForOwner(owner_id: string, id: string) {
    const e = this.envelopes.get(id);
    return e && e.owner_id === owner_id ? e : null;
  }

  async findByIdWithAll(id: string) {
    return this.envelopes.get(id) ?? null;
  }

  async findByShortCode(short_code: string) {
    return [...this.envelopes.values()].find((e) => e.short_code === short_code) ?? null;
  }

  async findSignerByAccessTokenHash(): Promise<{
    envelope: Envelope;
    signer: EnvelopeSigner;
  } | null> {
    throw new Error('not_implemented_in_fake');
  }

  async listByOwner(owner_id: string, opts: ListOptions): Promise<ListResult> {
    let items = [...this.envelopes.values()].filter((e) => e.owner_id === owner_id);
    if (opts.statuses) items = items.filter((e) => opts.statuses!.includes(e.status));
    items.sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
    if (opts.cursor) {
      items = items.filter(
        (e) =>
          e.updated_at < opts.cursor!.updated_at ||
          (e.updated_at === opts.cursor!.updated_at && e.id < opts.cursor!.id),
      );
    }
    const page = items.slice(0, opts.limit);
    const mapped = page.map((e) => ({
      id: e.id,
      title: e.title,
      short_code: e.short_code,
      status: e.status,
      original_pages: e.original_pages,
      sent_at: e.sent_at,
      completed_at: e.completed_at,
      expires_at: e.expires_at,
      tags: [...(e.tags ?? [])],
      created_at: e.created_at,
      updated_at: e.updated_at,
      signers: e.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        color: s.color,
        status: s.status,
        signed_at: s.signed_at,
      })),
    }));
    const next =
      page.length === opts.limit && items.length > opts.limit
        ? Buffer.from(`${page[page.length - 1]!.updated_at}|${page[page.length - 1]!.id}`).toString(
            'base64url',
          )
        : null;
    return { items: mapped, next_cursor: next };
  }

  async listEventsForEnvelope(envelope_id: string): Promise<readonly EnvelopeEvent[]> {
    return this.events.filter((e) => e.envelope_id === envelope_id);
  }

  async listSignerAuditDetails(envelope_id: string) {
    const env = this.envelopes.get(envelope_id);
    if (!env) return [];
    return env.signers.map((s) => ({
      signer_id: s.id,
      signature_format: null,
      signature_font: null,
      verification_checks: ['email'] as ReadonlyArray<string>,
      signing_ip: null,
    }));
  }

  async listSignerImagePaths(envelope_id: string) {
    const env = this.envelopes.get(envelope_id);
    if (!env) return [];
    return env.signers.map((s) => ({
      signer_id: s.id,
      signature_image_path: null,
      initials_image_path: null,
    }));
  }

  async purgeOwnedDataForAccountDeletion(_input: {
    readonly owner_id: string;
    readonly email: string | null;
    readonly email_hash: string;
  }) {
    return {
      drafts_deleted: 0,
      envelopes_preserved: 0,
      signers_anonymized: 0,
      retention_events_appended: 0,
    };
  }

  async updateDraftMetadata(
    owner_id: string,
    envelope_id: string,
    patch: UpdateDraftMetadataPatch,
  ) {
    const e = await this.findByIdForOwner(owner_id, envelope_id);
    if (!e) return null;
    const { tags, ...draftOnly } = patch;
    if (Object.keys(draftOnly).length > 0 && e.status !== 'draft') return null;
    const next: Envelope = {
      ...e,
      ...draftOnly,
      ...(tags !== undefined ? { tags: [...tags] } : {}),
      updated_at: new Date().toISOString(),
    };
    this.envelopes.set(envelope_id, next);
    return next;
  }

  async deleteDraft(owner_id: string, envelope_id: string) {
    const e = await this.findByIdForOwner(owner_id, envelope_id);
    if (!e || e.status !== 'draft') return false;
    this.envelopes.delete(envelope_id);
    return true;
  }

  async setOriginalFile(envelope_id: string, input: SetOriginalFileInput) {
    const e = this.envelopes.get(envelope_id);
    if (!e || e.status !== 'draft') return null;
    const next: Envelope = {
      ...e,
      original_pages: input.pages,
      original_sha256: input.sha256,
      updated_at: new Date().toISOString(),
    };
    this.envelopes.set(envelope_id, next);
    return next;
  }

  async addSigner(envelope_id: string, input: AddSignerInput): Promise<EnvelopeSigner> {
    const e = this.envelopes.get(envelope_id);
    if (!e) throw new Error('envelope_not_found');
    if (e.signers.some((s) => s.email === input.email)) {
      throw new EnvelopeSignerEmailTakenError();
    }
    const signer: EnvelopeSigner = {
      id: `s_${e.signers.length + 1}_${envelope_id}`,
      email: input.email,
      name: input.name,
      color: input.color,
      role: input.role ?? 'signatory',
      signing_order: 1,
      status: 'awaiting',
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    };
    const next: Envelope = { ...e, signers: [...e.signers, signer] };
    this.envelopes.set(envelope_id, next);
    return signer;
  }

  async removeSigner(envelope_id: string, signer_id: string) {
    const e = this.envelopes.get(envelope_id);
    if (!e) return false;
    const before = e.signers.length;
    const signers = e.signers.filter((s) => s.id !== signer_id);
    if (signers.length === before) return false;
    this.envelopes.set(envelope_id, { ...e, signers });
    return true;
  }

  async replaceFields(
    envelope_id: string,
    fields: readonly CreateFieldInput[],
  ): Promise<readonly EnvelopeField[]> {
    const e = this.envelopes.get(envelope_id);
    if (!e) throw new Error('envelope_not_found');
    const mapped: EnvelopeField[] = fields.map((f, i) => ({
      id: `f_${i}_${envelope_id}`,
      signer_id: f.signer_id,
      kind: f.kind,
      page: f.page,
      x: f.x,
      y: f.y,
      width: f.width ?? null,
      height: f.height ?? null,
      required: f.required ?? true,
      link_id: f.link_id ?? null,
      value_text: null,
      value_boolean: null,
      filled_at: null,
    }));
    this.envelopes.set(envelope_id, { ...e, fields: mapped });
    return mapped;
  }

  async sendDraft(): Promise<Envelope | null> {
    throw new Error('not_implemented_in_fake');
  }
  async rotateSignerAccessToken(signer_id: string): Promise<boolean> {
    for (const env of this.envelopes.values()) {
      const signer = env.signers.find((s) => s.id === signer_id);
      if (!signer) continue;
      if (env.status !== 'awaiting_others') return false;
      if (signer.signed_at !== null || signer.declined_at !== null) return false;
      return true;
    }
    return false;
  }
  async recordSignerViewed(): Promise<EnvelopeSigner> {
    throw new Error('not_implemented_in_fake');
  }
  async acceptTerms(): Promise<EnvelopeSigner> {
    throw new Error('not_implemented_in_fake');
  }
  async fillField(
    _field_id: string,
    _signer_id: string,
    _value: SignerFieldFillInput,
  ): Promise<EnvelopeField | null> {
    throw new Error('not_implemented_in_fake');
  }
  async setSignerSignature(
    _signer_id: string,
    _input: SetSignerSignatureInput,
  ): Promise<EnvelopeSigner> {
    throw new Error('not_implemented_in_fake');
  }
  async submitSigner(): Promise<SubmitResult | null> {
    throw new Error('not_implemented_in_fake');
  }
  async declineSigner(): Promise<Envelope | null> {
    throw new Error('not_implemented_in_fake');
  }
  async cancelEnvelope(
    envelope_id: string,
    owner_id: string,
  ): Promise<{
    readonly envelope: Envelope;
    readonly notifiedSignerIds: readonly string[];
    readonly alreadySignedSignerIds: readonly string[];
  } | null> {
    const env = this.envelopes.get(envelope_id);
    if (!env) return null;
    if (env.owner_id !== owner_id) return null;
    if (env.status !== 'awaiting_others' && env.status !== 'sealing') return null;
    const notifiedSignerIds: string[] = [];
    const alreadySignedSignerIds: string[] = [];
    for (const s of env.signers) {
      if (s.signed_at !== null) alreadySignedSignerIds.push(s.id);
      else if (s.declined_at === null) notifiedSignerIds.push(s.id);
    }
    const next: Envelope = { ...env, status: 'canceled', updated_at: new Date().toISOString() };
    this.envelopes.set(envelope_id, next);
    return { envelope: next, notifiedSignerIds, alreadySignedSignerIds };
  }
  async expireEnvelopes(): Promise<readonly string[]> {
    throw new Error('not_implemented_in_fake');
  }

  /** Side map mirroring the prev_event_hash column. Tests can corrupt or
   *  inspect it via `getPrevHash` / `setPrevHash`. */
  readonly prevHashes = new Map<string, Buffer | null>();

  async appendEvent(input: EventInput): Promise<EnvelopeEvent> {
    const previous = this.events.filter((e) => e.envelope_id === input.envelope_id);
    const latest = previous.length > 0 ? previous[previous.length - 1]! : null;
    const prev = latest ? eventHash(latest) : null;
    const event: EnvelopeEvent = {
      id: `ev_${this.events.length + 1}`,
      envelope_id: input.envelope_id,
      signer_id: input.signer_id ?? null,
      actor_kind: input.actor_kind,
      event_type: input.event_type,
      ip: input.ip ?? null,
      user_agent: input.user_agent ?? null,
      metadata: input.metadata ?? {},
      created_at: new Date().toISOString(),
    };
    this.events.push(event);
    this.prevHashes.set(event.id, prev);
    return event;
  }

  async verifyEventChain(envelope_id: string): Promise<{ readonly chain_intact: boolean }> {
    const list = this.events.filter((e) => e.envelope_id === envelope_id);
    if (list.length === 0) return { chain_intact: true };
    const genesis = list[0]!;
    const genesisHash = this.prevHashes.get(genesis.id);
    if (genesisHash !== null && genesisHash !== undefined) return { chain_intact: false };
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]!;
      const curr = list[i]!;
      const expected = eventHash(prev);
      const stored = this.prevHashes.get(curr.id);
      if (!stored || !stored.equals(expected)) return { chain_intact: false };
    }
    return { chain_intact: true };
  }

  /** Test-only: tamper directly with the chain map. */
  setPrevHash(event_id: string, value: Buffer | null): void {
    this.prevHashes.set(event_id, value);
  }

  jobs: Array<{ readonly envelope_id: string; readonly kind: 'seal' | 'audit_only' }> = [];
  async enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only'): Promise<string> {
    this.jobs.push({ envelope_id, kind });
    return `job_${this.jobs.length}`;
  }
  async claimNextJob(): Promise<never> {
    throw new Error('not_implemented_in_fake');
  }
  async finishJob(): Promise<void> {
    throw new Error('not_implemented_in_fake');
  }
  async failJob(): Promise<void> {
    throw new Error('not_implemented_in_fake');
  }
  async transitionToSealed(): Promise<never> {
    throw new Error('not_implemented_in_fake');
  }
  async setAuditFile(): Promise<never> {
    throw new Error('not_implemented_in_fake');
  }

  async getFilePaths(): Promise<never> {
    throw new Error('not_implemented_in_fake');
  }

  decodeCursorOrThrow(cursor: string): { updated_at: string; id: string } {
    try {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
      const pipe = decoded.indexOf('|');
      if (pipe <= 0) throw new InvalidCursorError();
      return { updated_at: decoded.slice(0, pipe), id: decoded.slice(pipe + 1) };
    } catch (err) {
      if (err instanceof InvalidCursorError) throw err;
      throw new InvalidCursorError();
    }
  }
}

const TEST_ENV = {
  TC_VERSION: '2026-04-24',
  PRIVACY_VERSION: '2026-04-24',
  APP_PUBLIC_URL: 'http://localhost:5173',
} as unknown as AppEnv;

/** Minimal in-memory outbox for service tests. */
class FakeOutbound extends OutboundEmailsRepository {
  rows: OutboundEmailRow[] = [];
  async insert(input: InsertOutboundEmailInput): Promise<OutboundEmailRow> {
    const row: OutboundEmailRow = {
      id: `em_${this.rows.length + 1}`,
      envelope_id: input.envelope_id ?? null,
      signer_id: input.signer_id ?? null,
      kind: input.kind,
      to_email: input.to_email,
      to_name: input.to_name,
      payload: { ...input.payload },
      status: 'pending',
      attempts: 0,
      max_attempts: input.max_attempts ?? 8,
      scheduled_for: input.scheduled_for ?? new Date().toISOString(),
      sent_at: null,
      last_error: null,
      provider_id: null,
      source_event_id: input.source_event_id ?? null,
      created_at: new Date().toISOString(),
    };
    this.rows.push(row);
    return row;
  }
  async insertMany(
    inputs: readonly InsertOutboundEmailInput[],
  ): Promise<readonly OutboundEmailRow[]> {
    const out: OutboundEmailRow[] = [];
    for (const i of inputs) out.push(await this.insert(i));
    return out;
  }
  async listByEnvelope(envelope_id: string): Promise<readonly OutboundEmailRow[]> {
    return this.rows.filter((r) => r.envelope_id === envelope_id);
  }
  async findLastInviteOrReminder(envelope_id: string, signer_id: string) {
    const match = this.rows
      .filter(
        (r) =>
          r.envelope_id === envelope_id &&
          r.signer_id === signer_id &&
          (r.kind === 'invite' || r.kind === 'reminder'),
      )
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1));
    return match[0] ?? null;
  }
  async claimNext(): Promise<OutboundEmailRow | null> {
    return null;
  }
  async markSent(): Promise<void> {
    /* unused by service-level tests */
  }
  async markFailed(): Promise<void> {
    /* unused by service-level tests */
  }
}

/** Stub storage — service-level tests don't exercise uploadOriginal. */
class FakeStorage extends StorageService {
  async upload() {
    /* no-op */
  }
  async download() {
    return Buffer.alloc(0);
  }
  async remove() {
    /* no-op */
  }
  async createSignedUrl() {
    return 'https://example.invalid/signed';
  }
  async exists() {
    return false;
  }
}

describe('EnvelopesService', () => {
  const OWNER = 'user-1';
  const OTHER = 'user-2';
  let repo: FakeEnvelopesRepo;
  let contacts: FakeContactsRepo;
  let storage: FakeStorage;
  let outbound: FakeOutbound;
  let tokens: SigningTokenService;
  let svc: EnvelopesService;

  beforeEach(() => {
    repo = new FakeEnvelopesRepo();
    contacts = new FakeContactsRepo();
    storage = new FakeStorage();
    outbound = new FakeOutbound();
    tokens = new SigningTokenService();
    svc = new EnvelopesService(repo, contacts, storage, outbound, tokens, TEST_ENV);
  });

  describe('createDraft', () => {
    it('returns a draft with tc + privacy snapshot and default 30d expiry', async () => {
      const e = await svc.createDraft(OWNER, { title: 'NDA' });
      expect(e.status).toBe('draft');
      expect(e.tc_version).toBe('2026-04-24');
      expect(e.privacy_version).toBe('2026-04-24');
      expect(new Date(e.expires_at).getTime()).toBeGreaterThan(Date.now());
    });

    it('writes a created event', async () => {
      const e = await svc.createDraft(OWNER, { title: 'NDA' });
      expect(repo.events).toHaveLength(1);
      expect(repo.events[0]?.envelope_id).toBe(e.id);
      expect(repo.events[0]?.event_type).toBe('created');
    });

    it('retries on short code collision', async () => {
      repo.throwShortCodeCollisionNTimes = 2;
      const e = await svc.createDraft(OWNER, { title: 'X' });
      expect(e.id).toBeDefined();
    });

    it('surfaces persistent short-code collision after max retries', async () => {
      repo.throwShortCodeCollisionNTimes = 10;
      await expect(svc.createDraft(OWNER, { title: 'X' })).rejects.toBeInstanceOf(
        ShortCodeCollisionError,
      );
    });
  });

  describe('getById', () => {
    it('returns owned envelope', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const got = await svc.getById(OWNER, e.id);
      expect(got.id).toBe(e.id);
    });

    it('404 on unknown', async () => {
      await expect(svc.getById(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 on cross-owner', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.getById(OTHER, e.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns owner envelopes, default limit 20', async () => {
      await svc.createDraft(OWNER, { title: 'A' });
      await svc.createDraft(OWNER, { title: 'B' });
      await svc.createDraft(OTHER, { title: 'C' });
      const res = await svc.list(OWNER, {});
      expect(res.items).toHaveLength(2);
    });

    it('rejects invalid status', async () => {
      await expect(svc.list(OWNER, { statuses: ['bogus' as 'draft'] })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects invalid cursor', async () => {
      await expect(svc.list(OWNER, { cursor: '!!!' })).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'invalid_cursor',
      });
    });
  });

  describe('patchDraft', () => {
    it('patches a draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'Old' });
      const patched = await svc.patchDraft(OWNER, e.id, { title: 'New' });
      expect(patched.title).toBe('New');
    });

    it('400 on empty patch', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.patchDraft(OWNER, e.id, {})).rejects.toBeInstanceOf(BadRequestException);
    });

    it('404 on unknown', async () => {
      await expect(svc.patchDraft(OWNER, 'missing', { title: 'y' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409 on non-draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      // Force non-draft
      repo.envelopes.set(e.id, { ...repo.envelopes.get(e.id)!, status: 'completed' });
      await expect(svc.patchDraft(OWNER, e.id, { title: 'y' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('deleteDraft', () => {
    it('deletes a draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await svc.deleteDraft(OWNER, e.id);
      expect(repo.envelopes.has(e.id)).toBe(false);
    });

    it('404 on unknown', async () => {
      await expect(svc.deleteDraft(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 on non-draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      repo.envelopes.set(e.id, { ...repo.envelopes.get(e.id)!, status: 'completed' });
      await expect(svc.deleteDraft(OWNER, e.id)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('setOriginalFile', () => {
    it('commits upload metadata', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const updated = await svc.setOriginalFile(OWNER, e.id, {
        file_path: `envelopes/${e.id}/original.pdf`,
        sha256: 'a'.repeat(64),
        pages: 3,
      });
      expect(updated.original_pages).toBe(3);
      expect(repo.events.some((ev) => ev.metadata?.['pages'] === 3)).toBe(true);
    });

    it('409 on non-draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      repo.envelopes.set(e.id, { ...repo.envelopes.get(e.id)!, status: 'completed' });
      await expect(
        svc.setOriginalFile(OWNER, e.id, {
          file_path: 'x',
          sha256: 'a'.repeat(64),
          pages: 1,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('addSigner', () => {
    it('snapshots contact and attaches signer', async () => {
      const contact = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@x.com',
        color: '#112233',
      });
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const signer = await svc.addSigner(OWNER, e.id, { contact_id: contact.id });
      expect(signer.email).toBe('ada@x.com');
      expect(signer.color).toBe('#112233');
    });

    it('404 on unknown envelope', async () => {
      await expect(svc.addSigner(OWNER, 'missing', { contact_id: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('404 on unknown contact', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.addSigner(OWNER, e.id, { contact_id: 'missing' })).rejects.toMatchObject({
        message: 'contact_not_found',
      });
    });

    it('409 on duplicate email for same envelope', async () => {
      const c = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@x.com',
        color: '#112233',
      });
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await svc.addSigner(OWNER, e.id, { contact_id: c.id });
      await expect(svc.addSigner(OWNER, e.id, { contact_id: c.id })).rejects.toMatchObject({
        message: 'signer_email_taken',
      });
    });

    it('409 on non-draft envelope', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      repo.envelopes.set(e.id, { ...repo.envelopes.get(e.id)!, status: 'completed' });
      await expect(svc.addSigner(OWNER, e.id, { contact_id: 'x' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('attaches an adhoc signer (email+name+color) without a saved contact', async () => {
      // Guest-mode senders synthesise signers locally (UploadRoute.synthLocalSigner)
      // so the addSigner call has no contact uuid to resolve. The repo persists
      // the row with `contact_id: null`; the snapshotted email/name/color come
      // straight from the request body and no contacts row is created.
      const sizeBefore = contacts.store.size;
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const signer = await svc.addSigner(OWNER, e.id, {
        email: 'guest@x.com',
        name: 'Guest Person',
        color: '#7C3AED',
      });
      expect(signer.email).toBe('guest@x.com');
      expect(signer.name).toBe('Guest Person');
      expect(signer.color).toBe('#7C3AED');
      // Adhoc payload must NOT spawn a contacts row.
      expect(contacts.store.size).toBe(sizeBefore);
    });

    it('adhoc signer falls back to a default colour when none was sent', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const signer = await svc.addSigner(OWNER, e.id, {
        email: 'no-color@x.com',
        name: 'No Color',
      });
      expect(signer.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });

    it('rejects an adhoc payload missing email or name', async () => {
      // Defence-in-depth: the DTO normally rejects this at the controller
      // boundary, but the service guards against direct callers too.
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.addSigner(OWNER, e.id, { email: 'only-email@x.com' })).rejects.toMatchObject(
        { message: 'signer_payload_invalid' },
      );
    });
  });

  describe('removeSigner', () => {
    it('removes an existing signer', async () => {
      const c = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@x.com',
        color: '#112233',
      });
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const s = await svc.addSigner(OWNER, e.id, { contact_id: c.id });
      await svc.removeSigner(OWNER, e.id, s.id);
      const fresh = await svc.getById(OWNER, e.id);
      expect(fresh.signers).toHaveLength(0);
    });

    it('404 on unknown signer', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.removeSigner(OWNER, e.id, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('replaceFields', () => {
    it('rejects field referencing unknown signer', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(
        svc.replaceFields(OWNER, e.id, [
          {
            signer_id: 'not-in-envelope',
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.1,
          },
        ]),
      ).rejects.toMatchObject({ message: 'signer_not_in_envelope' });
    });

    it('accepts valid fields', async () => {
      const c = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@x.com',
        color: '#112233',
      });
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const s = await svc.addSigner(OWNER, e.id, { contact_id: c.id });
      const fields = await svc.replaceFields(OWNER, e.id, [
        { signer_id: s.id, kind: 'signature', page: 1, x: 0.1, y: 0.1 },
      ]);
      expect(fields).toHaveLength(1);
    });

    it('409 on non-draft', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      repo.envelopes.set(e.id, { ...repo.envelopes.get(e.id)!, status: 'completed' });
      await expect(svc.replaceFields(OWNER, e.id, [])).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('listEvents', () => {
    it('returns events for an owned envelope', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const events = await svc.listEvents(OWNER, e.id);
      expect(events).toHaveLength(1);
      expect(events[0]?.event_type).toBe('created');
    });

    it('404 on cross-owner', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await expect(svc.listEvents(OTHER, e.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('audit-event hash chain', () => {
    it('verifyEventChain returns chain_intact=true after sequential appends', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      // createDraft already appended a 'created' genesis event. Append two more.
      await repo.appendEvent({
        envelope_id: e.id,
        actor_kind: 'system',
        event_type: 'sent',
      });
      await repo.appendEvent({
        envelope_id: e.id,
        actor_kind: 'system',
        event_type: 'viewed',
      });
      const result = await repo.verifyEventChain(e.id);
      expect(result.chain_intact).toBe(true);
    });

    it('verifyEventChain returns chain_intact=false after metadata mutation bypassing appendEvent', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await repo.appendEvent({
        envelope_id: e.id,
        actor_kind: 'system',
        event_type: 'sent',
      });
      await repo.appendEvent({
        envelope_id: e.id,
        actor_kind: 'system',
        event_type: 'viewed',
      });
      // Mutate event #2's metadata directly, simulating a DB row hand-edit.
      const target = repo.events.find((ev) => ev.envelope_id === e.id && ev.event_type === 'sent')!;
      target.metadata = { tampered: true };
      const result = await repo.verifyEventChain(e.id);
      expect(result.chain_intact).toBe(false);
    });

    it('verifyEventChain returns chain_intact=false when prev_event_hash is corrupted', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      await repo.appendEvent({
        envelope_id: e.id,
        actor_kind: 'system',
        event_type: 'sent',
      });
      // Corrupt the stored prev_event_hash on the second event.
      const second = repo.events.find((ev) => ev.envelope_id === e.id && ev.event_type === 'sent')!;
      repo.setPrevHash(second.id, Buffer.alloc(32, 0xff));
      const result = await repo.verifyEventChain(e.id);
      expect(result.chain_intact).toBe(false);
    });

    it('genesis event has null prev_event_hash', async () => {
      const e = await svc.createDraft(OWNER, { title: 'X' });
      const genesis = repo.events.find((ev) => ev.envelope_id === e.id);
      expect(genesis).toBeDefined();
      expect(repo.prevHashes.get(genesis!.id)).toBeNull();
    });
  });

  describe('cancel', () => {
    /**
     * Stamp a sent envelope with the given per-signer state and force the
     * status flip — we exercise `cancel` directly here without going
     * through the full draft → upload → addSigner → send pipeline (those
     * are covered by the e2e specs).
     */
    function setupSentEnvelope(args: {
      readonly status?: 'awaiting_others' | 'sealing' | 'completed' | 'canceled';
      readonly signers: ReadonlyArray<{
        readonly id: string;
        readonly name: string;
        readonly email: string;
        readonly signed_at?: string | null;
        readonly declined_at?: string | null;
      }>;
    }): { readonly id: string } {
      const id = `env_${repo.envelopes.size + 1}`;
      const now = new Date().toISOString();
      const env: Envelope = {
        id,
        owner_id: OWNER,
        title: 'Sent envelope',
        short_code: 'AAAA-BBBB-CCC',
        status: args.status ?? 'awaiting_others',
        delivery_mode: 'parallel',
        original_pages: 1,
        original_sha256: 'a'.repeat(64),
        sealed_sha256: null,
        sender_email: 'sender@example.com',
        sender_name: 'Sender Name',
        sent_at: now,
        completed_at: null,
        expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(),
        tc_version: '2026-04-24',
        privacy_version: '2026-04-24',
        tags: [],
        signers: args.signers.map((s) => ({
          id: s.id,
          email: s.email,
          name: s.name,
          color: '#112233',
          role: 'signatory',
          signing_order: 1,
          status:
            s.signed_at != null ? 'completed' : s.declined_at != null ? 'declined' : 'awaiting',
          viewed_at: null,
          tc_accepted_at: null,
          signed_at: s.signed_at ?? null,
          declined_at: s.declined_at ?? null,
        })),
        fields: [],
        created_at: now,
        updated_at: now,
      };
      repo.envelopes.set(id, env);
      return { id };
    }

    it('flips awaiting_others → canceled, records canceled event, fans out withdrawn_to_signer + audit_only job', async () => {
      const { id } = setupSentEnvelope({
        signers: [
          { id: 's1', name: 'Ada', email: 'ada@x.com' },
          { id: 's2', name: 'Bea', email: 'bea@x.com' },
        ],
      });

      const res = await svc.cancel(OWNER, id);

      expect(res).toEqual({ status: 'canceled', envelope_status: 'canceled' });
      expect(repo.envelopes.get(id)?.status).toBe('canceled');

      const types = repo.events.filter((e) => e.envelope_id === id).map((e) => e.event_type);
      expect(types).toContain('canceled');
      expect(types.filter((t) => t === 'session_invalidated_by_cancel')).toHaveLength(2);

      const queued = outbound.rows.filter((r) => r.envelope_id === id);
      expect(queued).toHaveLength(2);
      expect(queued.every((r) => r.kind === 'withdrawn_to_signer')).toBe(true);
      expect(queued.map((r) => r.to_email).sort()).toEqual(['ada@x.com', 'bea@x.com']);
      expect(queued[0]!.payload).toMatchObject({
        envelope_title: 'Sent envelope',
        sender_name: 'Sender Name',
      });

      expect(repo.jobs).toEqual([{ envelope_id: id, kind: 'audit_only' }]);
    });

    it('routes already-signed signers to withdrawn_after_sign and pending signers to withdrawn_to_signer', async () => {
      const signedAt = new Date().toISOString();
      const { id } = setupSentEnvelope({
        status: 'sealing',
        signers: [
          { id: 's1', name: 'Ada', email: 'ada@x.com', signed_at: signedAt },
          { id: 's2', name: 'Bea', email: 'bea@x.com' },
        ],
      });

      await svc.cancel(OWNER, id);

      const queued = outbound.rows.filter((r) => r.envelope_id === id);
      const byEmail = new Map(queued.map((r) => [r.to_email, r]));
      expect(byEmail.get('ada@x.com')?.kind).toBe('withdrawn_after_sign');
      expect(byEmail.get('bea@x.com')?.kind).toBe('withdrawn_to_signer');
      expect(byEmail.get('ada@x.com')?.payload).toMatchObject({
        signed_at_readable: expect.stringMatching(/UTC$/),
      });
      const sessionInvals = repo.events.filter(
        (e) => e.event_type === 'session_invalidated_by_cancel',
      );
      expect(sessionInvals).toHaveLength(1);
      expect(sessionInvals[0]?.signer_id).toBe('s2');
    });

    it('404 envelope_not_found when caller is not the owner', async () => {
      const { id } = setupSentEnvelope({
        signers: [{ id: 's1', name: 'Ada', email: 'ada@x.com' }],
      });
      await expect(svc.cancel(OTHER, id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 envelope_terminal when the envelope is already completed', async () => {
      const { id } = setupSentEnvelope({
        status: 'completed',
        signers: [
          { id: 's1', name: 'Ada', email: 'ada@x.com', signed_at: new Date().toISOString() },
        ],
      });
      await expect(svc.cancel(OWNER, id)).rejects.toBeInstanceOf(ConflictException);
    });

    it('409 envelope_terminal when the envelope is already canceled (idempotency guard)', async () => {
      const { id } = setupSentEnvelope({
        status: 'canceled',
        signers: [{ id: 's1', name: 'Ada', email: 'ada@x.com' }],
      });
      await expect(svc.cancel(OWNER, id)).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
