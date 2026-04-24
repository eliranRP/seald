import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { AppEnv } from '../config/env.schema';
import type { Contact } from '../contacts/contact.entity';
import {
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from '../contacts/contacts.repository';
import {
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
  type OutboundEmailRow,
} from '../email/outbound-emails.repository';
import { SigningTokenService } from '../signing/signing-token.service';
import { StorageService } from '../storage/storage.service';
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
} from './envelopes.repository';
import {
  EnvelopeSignerEmailTakenError,
  EnvelopesRepository,
  InvalidCursorError,
  ShortCodeCollisionError,
} from './envelopes.repository';
import { EnvelopesService } from './envelopes.service';

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
    const env: Envelope = {
      id: `e_${this.envelopes.size + 1}`,
      owner_id: input.owner_id,
      title: input.title,
      short_code: input.short_code,
      status: 'draft',
      delivery_mode: 'parallel',
      original_pages: null,
      original_sha256: null,
      sealed_sha256: null,
      sender_email: null,
      sender_name: null,
      sent_at: null,
      completed_at: null,
      expires_at: input.expires_at,
      tc_version: input.tc_version,
      privacy_version: input.privacy_version,
      signers: [],
      fields: [],
      created_at: now,
      updated_at: now,
    };
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

  async updateDraftMetadata(
    owner_id: string,
    envelope_id: string,
    patch: UpdateDraftMetadataPatch,
  ) {
    const e = await this.findByIdForOwner(owner_id, envelope_id);
    if (!e || e.status !== 'draft') return null;
    const next: Envelope = { ...e, ...patch, updated_at: new Date().toISOString() };
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
  async expireEnvelopes(): Promise<readonly string[]> {
    throw new Error('not_implemented_in_fake');
  }

  async appendEvent(input: EventInput): Promise<EnvelopeEvent> {
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
    return event;
  }

  async enqueueJob(): Promise<string> {
    throw new Error('not_implemented_in_fake');
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
});
