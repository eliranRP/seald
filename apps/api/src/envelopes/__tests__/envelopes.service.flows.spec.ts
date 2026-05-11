import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
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
import { SigningTokenService } from '../../signing/signing-token.service';
import { StorageService } from '../../storage/storage.service';
import type {
  AddSignerInput,
  CreateDraftInput,
  CreateFieldInput,
  Envelope,
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
  EventInput,
  ListOptions,
  ListResult,
  SendDraftInput,
  SetOriginalFileInput,
  SetSignerSignatureInput,
  SignerFieldFillInput,
  SubmitResult,
  UpdateDraftMetadataPatch,
} from '../envelopes.repository';
import { EnvelopesRepository } from '../envelopes.repository';
import { eventHash } from '../event-hash';
import { EnvelopesService } from '../envelopes.service';

/**
 * Coverage for the EnvelopesService methods that the existing
 * `envelopes.service.spec.ts` doesn't exercise: send, uploadOriginal,
 * getDownloadUrl, remindSigner, plus race-condition edges on cancel.
 *
 * The HTTP plumbing is covered by `apps/api/test/envelopes-sender.e2e-spec.ts`
 * (a real Nest app + supertest); the goal here is to lift unit-test
 * coverage on `src/envelopes/envelopes.service.ts` past the audit
 * baseline by hitting paths the e2e suite touches but that don't show
 * up in the unit run's coverage matrix.
 */

const TEST_ENV = {
  TC_VERSION: '2026-04-24',
  PRIVACY_VERSION: '2026-04-24',
  APP_PUBLIC_URL: 'http://localhost:5173/',
} as unknown as AppEnv;

const OWNER = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

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
  async insertMany(inputs: readonly InsertOutboundEmailInput[]) {
    const out: OutboundEmailRow[] = [];
    for (const i of inputs) out.push(await this.insert(i));
    return out;
  }
  async listByEnvelope(envelope_id: string) {
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
  async claimNext() {
    return null;
  }
  async markSent() {
    /* unused */
  }
  async markFailed() {
    /* unused */
  }
}

class FakeStorage extends StorageService {
  uploads: Array<{ path: string; bytes: Buffer; contentType: string }> = [];
  shouldFailNextSignedUrl = false;
  async upload(path: string, bytes: Buffer, contentType: string) {
    this.uploads.push({ path, bytes, contentType });
  }
  async download() {
    return Buffer.alloc(0);
  }
  async remove() {
    /* no-op */
  }
  async createSignedUrl(path: string, ttl: number) {
    if (this.shouldFailNextSignedUrl) {
      this.shouldFailNextSignedUrl = false;
      throw new Error('signing failed');
    }
    return `https://example.invalid/signed/${encodeURIComponent(path)}?ttl=${ttl}`;
  }
  async exists() {
    return false;
  }
}

class FakeRepo extends EnvelopesRepository {
  envelopes = new Map<string, Envelope>();
  events: EnvelopeEvent[] = [];
  prevHashes = new Map<string, Buffer | null>();
  filePaths = new Map<
    string,
    {
      original_file_path: string | null;
      sealed_file_path: string | null;
      audit_file_path: string | null;
    }
  >();
  jobs: Array<{ envelope_id: string; kind: 'seal' | 'audit_only' }> = [];
  rotateLog: string[] = [];

  /** Force the next sendDraft call to lose the race (atomic transition fails). */
  failNextSendDraft = false;
  /** Force the next rotateSignerAccessToken call to fail (signer raced). */
  failNextRotate = false;

  async createDraft(input: CreateDraftInput): Promise<Envelope> {
    const id = `env_${this.envelopes.size + 1}`;
    const now = new Date().toISOString();
    const env: Envelope = {
      id,
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
      tags: [],
      created_at: now,
      updated_at: now,
    } as unknown as Envelope;
    this.envelopes.set(id, env);
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
  async findSignerByAccessTokenHash() {
    return null;
  }
  async listByOwner(owner_id: string, opts: ListOptions): Promise<ListResult> {
    const items = [...this.envelopes.values()].filter((e) => e.owner_id === owner_id);
    return {
      items: items.slice(0, opts.limit).map((e) => ({
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
        signers: [],
      })),
      next_cursor: null,
    };
  }
  async listEventsForEnvelope(envelope_id: string) {
    return this.events.filter((e) => e.envelope_id === envelope_id);
  }
  async verifyEventChain(envelope_id: string) {
    const list = this.events.filter((e) => e.envelope_id === envelope_id);
    if (list.length === 0) return { chain_intact: true };
    const genesisHash = this.prevHashes.get(list[0]!.id);
    if (genesisHash !== null && genesisHash !== undefined) return { chain_intact: false };
    for (let i = 1; i < list.length; i++) {
      const expected = eventHash(list[i - 1]!);
      const stored = this.prevHashes.get(list[i]!.id);
      if (!stored || !stored.equals(expected)) return { chain_intact: false };
    }
    return { chain_intact: true };
  }
  async listSignerAuditDetails() {
    return [];
  }
  async listSignerImagePaths() {
    return [];
  }
  async purgeOwnedDataForAccountDeletion() {
    return {
      drafts_deleted: 0,
      envelopes_preserved: 0,
      signers_anonymized: 0,
      retention_events_appended: 0,
    };
  }
  async updateDraftMetadata(owner_id: string, id: string, patch: UpdateDraftMetadataPatch) {
    const e = await this.findByIdForOwner(owner_id, id);
    if (!e || e.status !== 'draft') return null;
    const next: Envelope = { ...e, ...patch, updated_at: new Date().toISOString() } as Envelope;
    this.envelopes.set(id, next);
    return next;
  }
  async deleteDraft(owner_id: string, id: string) {
    const e = await this.findByIdForOwner(owner_id, id);
    if (!e || e.status !== 'draft') return false;
    this.envelopes.delete(id);
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
    } as Envelope;
    this.envelopes.set(envelope_id, next);
    const paths = this.filePaths.get(envelope_id) ?? {
      original_file_path: null,
      sealed_file_path: null,
      audit_file_path: null,
    };
    this.filePaths.set(envelope_id, { ...paths, original_file_path: input.file_path });
    return next;
  }
  async addSigner(envelope_id: string, input: AddSignerInput): Promise<EnvelopeSigner> {
    const e = this.envelopes.get(envelope_id);
    if (!e) throw new Error('envelope_not_found');
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
    } as EnvelopeSigner;
    const next: Envelope = { ...e, signers: [...e.signers, signer] } as Envelope;
    this.envelopes.set(envelope_id, next);
    return signer;
  }
  async removeSigner(envelope_id: string, signer_id: string) {
    const e = this.envelopes.get(envelope_id);
    if (!e) return false;
    const before = e.signers.length;
    const signers = e.signers.filter((s) => s.id !== signer_id);
    if (signers.length === before) return false;
    this.envelopes.set(envelope_id, { ...e, signers } as Envelope);
    return true;
  }
  async replaceFields(envelope_id: string, fields: readonly CreateFieldInput[]) {
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
    })) as EnvelopeField[];
    this.envelopes.set(envelope_id, { ...e, fields: mapped } as Envelope);
    return mapped;
  }
  async sendDraft(input: SendDraftInput): Promise<Envelope | null> {
    if (this.failNextSendDraft) {
      this.failNextSendDraft = false;
      return null;
    }
    const e = this.envelopes.get(input.envelope_id);
    if (!e || e.status !== 'draft') return null;
    const now = new Date().toISOString();
    const tokenByName = new Map(input.signer_tokens.map((t) => [t.signer_id, t.access_token_hash]));
    const next: Envelope = {
      ...e,
      status: 'awaiting_others',
      sent_at: now,
      sender_email: input.sender_email,
      sender_name: input.sender_name,
      signers: e.signers.map((s) =>
        tokenByName.has(s.id) ? { ...s, status: 'awaiting' as const } : s,
      ),
      updated_at: now,
    } as Envelope;
    this.envelopes.set(input.envelope_id, next);
    return next;
  }
  async rotateSignerAccessToken(signer_id: string, hash: string) {
    if (this.failNextRotate) {
      this.failNextRotate = false;
      return false;
    }
    for (const env of this.envelopes.values()) {
      const signer = env.signers.find((s) => s.id === signer_id);
      if (!signer) continue;
      if (env.status !== 'awaiting_others') return false;
      if (signer.signed_at !== null || signer.declined_at !== null) return false;
      this.rotateLog.push(hash);
      return true;
    }
    return false;
  }
  async recordSignerViewed(): Promise<EnvelopeSigner> {
    throw new Error('not_implemented');
  }
  async acceptTerms(): Promise<EnvelopeSigner> {
    throw new Error('not_implemented');
  }
  async fillField(_a: string, _b: string, _c: SignerFieldFillInput) {
    return null;
  }
  async setSignerSignature(_a: string, _b: SetSignerSignatureInput): Promise<EnvelopeSigner> {
    throw new Error('not_implemented');
  }
  async submitSigner(): Promise<SubmitResult | null> {
    return null;
  }
  async declineSigner(): Promise<Envelope | null> {
    return null;
  }
  async cancelEnvelope(envelope_id: string, owner_id: string) {
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
    const next: Envelope = {
      ...env,
      status: 'canceled',
      updated_at: new Date().toISOString(),
    } as Envelope;
    this.envelopes.set(envelope_id, next);
    return { envelope: next, notifiedSignerIds, alreadySignedSignerIds };
  }
  async expireEnvelopes(): Promise<readonly string[]> {
    return [];
  }
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
  async enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only') {
    this.jobs.push({ envelope_id, kind });
    return `job_${this.jobs.length}`;
  }
  async claimNextJob() {
    return null;
  }
  async finishJob() {
    /* no-op */
  }
  async failJob() {
    /* no-op */
  }
  async transitionToSealed() {
    return null;
  }
  async setAuditFile() {
    return null;
  }
  async getFilePaths(envelope_id: string) {
    return this.filePaths.get(envelope_id) ?? null;
  }
  decodeCursorOrThrow(cursor: string) {
    return { sort_value: '', updated_at: '', id: cursor };
  }

  /** Test helper: hard-stamp file paths so getDownloadUrl resolves. */
  setFilePaths(
    envelope_id: string,
    paths: {
      original_file_path?: string | null;
      sealed_file_path?: string | null;
      audit_file_path?: string | null;
    },
  ) {
    const current = this.filePaths.get(envelope_id) ?? {
      original_file_path: null,
      sealed_file_path: null,
      audit_file_path: null,
    };
    this.filePaths.set(envelope_id, { ...current, ...paths });
  }
}

async function buildTinyPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([200, 200]);
  doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

describe('EnvelopesService — flow coverage', () => {
  let repo: FakeRepo;
  let contacts: FakeContactsRepo;
  let storage: FakeStorage;
  let outbound: FakeOutbound;
  let tokens: SigningTokenService;
  let svc: EnvelopesService;

  beforeEach(() => {
    repo = new FakeRepo();
    contacts = new FakeContactsRepo();
    storage = new FakeStorage();
    outbound = new FakeOutbound();
    tokens = new SigningTokenService();
    svc = new EnvelopesService(repo, contacts, storage, outbound, tokens, TEST_ENV);
  });

  /** Build a complete draft ready to send — upload + signer + sig field. */
  async function buildReadyDraft(): Promise<{ envId: string; signerId: string }> {
    const tinyPdf = await buildTinyPdf();
    const contact = await contacts.create({
      owner_id: OWNER,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    const env = await svc.createDraft(OWNER, { title: 'Send me' });
    await svc.uploadOriginal(OWNER, env.id, tinyPdf);
    const signer = await svc.addSigner(OWNER, env.id, { contact_id: contact.id });
    await svc.replaceFields(OWNER, env.id, [
      { signer_id: signer.id, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
    ]);
    return { envId: env.id, signerId: signer.id };
  }

  describe('uploadOriginal', () => {
    it('uploads to storage and records pages + sha256', async () => {
      const tinyPdf = await buildTinyPdf();
      const env = await svc.createDraft(OWNER, { title: 'X' });
      const out = await svc.uploadOriginal(OWNER, env.id, tinyPdf);
      expect(out.original_pages).toBe(2);
      expect(out.original_sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(storage.uploads).toHaveLength(1);
      expect(storage.uploads[0]!.path).toBe(`${env.id}/original.pdf`);
      expect(storage.uploads[0]!.contentType).toBe('application/pdf');
    });

    it('404 envelope_not_found for non-existent envelope', async () => {
      await expect(
        svc.uploadOriginal(OWNER, 'nope', Buffer.from('%PDF-1.4')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 envelope_not_found for cross-owner', async () => {
      const env = await svc.createDraft(OWNER, { title: 'X' });
      await expect(
        svc.uploadOriginal(OTHER, env.id, Buffer.from('%PDF-1.4')),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 envelope_not_draft when envelope is not draft', async () => {
      const env = await svc.createDraft(OWNER, { title: 'X' });
      repo.envelopes.set(env.id, {
        ...repo.envelopes.get(env.id)!,
        status: 'completed',
      } as Envelope);
      await expect(
        svc.uploadOriginal(OWNER, env.id, Buffer.from('%PDF-1.4')),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('413 file_too_large above 25 MB', async () => {
      const env = await svc.createDraft(OWNER, { title: 'X' });
      const huge = Buffer.alloc(25 * 1024 * 1024 + 1, 0x20);
      huge.set(Buffer.from('%PDF-'), 0);
      await expect(svc.uploadOriginal(OWNER, env.id, huge)).rejects.toBeInstanceOf(
        PayloadTooLargeException,
      );
    });

    it('415 file_not_pdf when bytes lack the %PDF- magic', async () => {
      const env = await svc.createDraft(OWNER, { title: 'X' });
      await expect(
        svc.uploadOriginal(OWNER, env.id, Buffer.from('not a pdf')),
      ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
    });

    it('400 file_unreadable for malformed PDF body', async () => {
      const env = await svc.createDraft(OWNER, { title: 'X' });
      // Magic header present but the rest is garbage → pdf-lib throws.
      await expect(
        svc.uploadOriginal(
          OWNER,
          env.id,
          Buffer.concat([Buffer.from('%PDF-'), Buffer.alloc(64, 0x20)]),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('send', () => {
    it('happy path — flips draft → awaiting_others, generates a token per signer, enqueues invites, writes sent events', async () => {
      const { envId, signerId } = await buildReadyDraft();
      const result = await svc.send(OWNER, envId, { email: 'sender@example.com', name: 'Sender' });

      expect(result.status).toBe('awaiting_others');
      expect(result.sender_email).toBe('sender@example.com');
      expect(result.sender_name).toBe('Sender');

      // One invite per signer.
      const invites = outbound.rows.filter((r) => r.kind === 'invite');
      expect(invites).toHaveLength(1);
      expect(invites[0]!.signer_id).toBe(signerId);
      expect(invites[0]!.to_email).toBe('ada@example.com');
      // Sign URL includes a 43-char token per the SigningTokenService contract.
      expect(String(invites[0]!.payload.sign_url)).toMatch(/\?t=[A-Za-z0-9_-]{43}$/);
      // Verify URL uses /verify/<short_code> not /verify/<id>.
      const env = await svc.getById(OWNER, envId);
      expect(String(invites[0]!.payload.verify_url)).toBe(
        `http://localhost:5173/verify/${env.short_code}`,
      );
      // Public URL is normalised — trailing slash trimmed even though APP_PUBLIC_URL has one.
      expect(String(invites[0]!.payload.public_url)).toBe('http://localhost:5173');

      // sent event written per signer with source-event linkage.
      const sentEvents = repo.events.filter(
        (e) => e.envelope_id === envId && e.event_type === 'sent',
      );
      expect(sentEvents).toHaveLength(1);
      expect(invites[0]!.source_event_id).toBe(sentEvents[0]!.id);
    });

    it('falls back to sender email as display name when sender.name is null', async () => {
      const { envId } = await buildReadyDraft();
      await svc.send(OWNER, envId, { email: 'noname@example.com' });
      const invites = outbound.rows.filter((r) => r.kind === 'invite');
      expect(invites[0]!.payload.sender_name).toBe('noname@example.com');
    });

    it('404 when envelope unknown', async () => {
      await expect(svc.send(OWNER, 'missing', { email: 'a@b.com' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('409 envelope_not_draft when status is not draft', async () => {
      const { envId } = await buildReadyDraft();
      await svc.send(OWNER, envId, { email: 'a@b.com' });
      // Second send → 409
      await expect(svc.send(OWNER, envId, { email: 'a@b.com' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('400 file_required when no PDF was uploaded', async () => {
      const contact = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await svc.createDraft(OWNER, { title: 'X' });
      const signer = await svc.addSigner(OWNER, env.id, { contact_id: contact.id });
      await svc.replaceFields(OWNER, env.id, [
        { signer_id: signer.id, kind: 'signature', page: 1, x: 0.1, y: 0.1, required: true },
      ]);
      await expect(svc.send(OWNER, env.id, { email: 'a@b.com' })).rejects.toMatchObject({
        message: 'file_required',
      });
    });

    it('400 no_signers when signer list is empty', async () => {
      const tinyPdf = await buildTinyPdf();
      const env = await svc.createDraft(OWNER, { title: 'X' });
      await svc.uploadOriginal(OWNER, env.id, tinyPdf);
      await expect(svc.send(OWNER, env.id, { email: 'a@b.com' })).rejects.toMatchObject({
        message: 'no_signers',
      });
    });

    it('400 no_fields when no fields are placed', async () => {
      const tinyPdf = await buildTinyPdf();
      const contact = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await svc.createDraft(OWNER, { title: 'X' });
      await svc.uploadOriginal(OWNER, env.id, tinyPdf);
      await svc.addSigner(OWNER, env.id, { contact_id: contact.id });
      await expect(svc.send(OWNER, env.id, { email: 'a@b.com' })).rejects.toMatchObject({
        message: 'no_fields',
      });
    });

    it('400 signer_without_signature_field when a signer has only non-sig fields', async () => {
      const tinyPdf = await buildTinyPdf();
      const contact = await contacts.create({
        owner_id: OWNER,
        name: 'Ada',
        email: 'ada@example.com',
        color: '#112233',
      });
      const env = await svc.createDraft(OWNER, { title: 'X' });
      await svc.uploadOriginal(OWNER, env.id, tinyPdf);
      const signer = await svc.addSigner(OWNER, env.id, { contact_id: contact.id });
      // Date field — not a signature/initials.
      await svc.replaceFields(OWNER, env.id, [
        { signer_id: signer.id, kind: 'date', page: 1, x: 0.1, y: 0.1, required: true },
      ]);
      await expect(svc.send(OWNER, env.id, { email: 'a@b.com' })).rejects.toMatchObject({
        message: 'signer_without_signature_field',
      });
    });

    it('409 envelope_not_draft when sendDraft loses the race (atomic transition fails)', async () => {
      const { envId } = await buildReadyDraft();
      repo.failNextSendDraft = true;
      await expect(svc.send(OWNER, envId, { email: 'a@b.com' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('getDownloadUrl', () => {
    async function setupSentEnvelope() {
      const { envId } = await buildReadyDraft();
      await svc.send(OWNER, envId, { email: 'sender@example.com' });
      return envId;
    }

    it('default kind returns sealed when sealed_file_path is set', async () => {
      const envId = await setupSentEnvelope();
      repo.setFilePaths(envId, { sealed_file_path: 'sealed/path.pdf' });
      const out = await svc.getDownloadUrl(OWNER, envId);
      expect(out.kind).toBe('sealed');
      expect(out.url).toContain('sealed%2Fpath.pdf');
    });

    it('default kind falls back to original when sealed is unavailable', async () => {
      const envId = await setupSentEnvelope();
      const out = await svc.getDownloadUrl(OWNER, envId);
      expect(out.kind).toBe('original');
      expect(out.url).toContain('original.pdf');
    });

    it('kind=audit returns the audit artifact', async () => {
      const envId = await setupSentEnvelope();
      repo.setFilePaths(envId, { audit_file_path: 'audit/trail.pdf' });
      const out = await svc.getDownloadUrl(OWNER, envId, 'audit');
      expect(out.kind).toBe('audit');
    });

    it('kind=sealed throws file_not_ready before sealing has stamped the row', async () => {
      const envId = await setupSentEnvelope();
      await expect(svc.getDownloadUrl(OWNER, envId, 'sealed')).rejects.toMatchObject({
        message: 'file_not_ready',
      });
    });

    it('kind=audit throws file_not_ready before audit PDF is produced', async () => {
      const envId = await setupSentEnvelope();
      await expect(svc.getDownloadUrl(OWNER, envId, 'audit')).rejects.toMatchObject({
        message: 'file_not_ready',
      });
    });

    it('404 for non-existent envelope', async () => {
      await expect(svc.getDownloadUrl(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 for cross-owner', async () => {
      const envId = await setupSentEnvelope();
      await expect(svc.getDownloadUrl(OTHER, envId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 when getFilePaths returns null even though envelope exists', async () => {
      const env = await svc.createDraft(OWNER, { title: 'No upload' });
      // No upload, no filePaths entry stamped.
      await expect(svc.getDownloadUrl(OWNER, env.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('remindSigner', () => {
    async function setupSentEnvelope() {
      const ready = await buildReadyDraft();
      await svc.send(OWNER, ready.envId, { email: 'sender@example.com' });
      return ready;
    }

    it('429 remind_throttled within an hour of the original invite', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      await expect(
        svc.remindSigner(OWNER, envId, signerId, { email: 'sender@example.com' }),
      ).rejects.toBeInstanceOf(HttpException);
      try {
        await svc.remindSigner(OWNER, envId, signerId, { email: 'sender@example.com' });
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        expect((e as HttpException).message).toBe('remind_throttled');
      }
    });

    it('happy path — past throttle window, rotates token, writes reminder_sent event, enqueues reminder', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      // Age the existing invite to before the throttle window.
      for (const row of outbound.rows) {
        (row as { created_at: string }).created_at = new Date(
          Date.now() - 2 * 60 * 60 * 1000,
        ).toISOString();
      }
      await svc.remindSigner(OWNER, envId, signerId, {
        email: 'sender@example.com',
        name: 'Sender Name',
      });

      const reminders = outbound.rows.filter((r) => r.kind === 'reminder');
      expect(reminders).toHaveLength(1);
      expect(reminders[0]!.to_email).toBe('ada@example.com');
      expect(String(reminders[0]!.payload.sign_url)).toMatch(/\?t=[A-Za-z0-9_-]{43}$/);
      expect(String(reminders[0]!.payload.expires_at_readable)).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
      );
      expect(String(reminders[0]!.payload.sender_name)).toBe('Sender Name');

      // Token rotation actually persisted a fresh hash.
      expect(repo.rotateLog).toHaveLength(1);

      const remindEvents = repo.events.filter((e) => e.event_type === 'reminder_sent');
      expect(remindEvents).toHaveLength(1);
      expect(remindEvents[0]!.signer_id).toBe(signerId);
      expect(reminders[0]!.source_event_id).toBe(remindEvents[0]!.id);
    });

    it('reminder sender_name falls back to email when name omitted', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      for (const row of outbound.rows) {
        (row as { created_at: string }).created_at = new Date(
          Date.now() - 2 * 60 * 60 * 1000,
        ).toISOString();
      }
      await svc.remindSigner(OWNER, envId, signerId, { email: 'noname@example.com' });
      const reminder = outbound.rows.find((r) => r.kind === 'reminder');
      expect(reminder?.payload.sender_name).toBe('noname@example.com');
    });

    it('404 envelope_not_found when envelope unknown', async () => {
      await expect(
        svc.remindSigner(OWNER, 'missing', 'sig-1', { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('404 envelope_not_found for cross-owner', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      await expect(
        svc.remindSigner(OTHER, envId, signerId, { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 envelope_terminal when envelope is still draft (never sent)', async () => {
      const { envId, signerId } = await buildReadyDraft();
      await expect(
        svc.remindSigner(OWNER, envId, signerId, { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 envelope_not_found when signer is unknown for the owned envelope', async () => {
      const { envId } = await setupSentEnvelope();
      await expect(
        svc.remindSigner(OWNER, envId, 'no-such-signer', { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('409 already_signed when signer has already signed', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      const env = repo.envelopes.get(envId)!;
      const next: Envelope = {
        ...env,
        signers: env.signers.map((s) =>
          s.id === signerId
            ? { ...s, signed_at: new Date().toISOString(), status: 'completed' }
            : s,
        ),
      } as Envelope;
      repo.envelopes.set(envId, next);
      await expect(
        svc.remindSigner(OWNER, envId, signerId, { email: 'a@b.com' }),
      ).rejects.toMatchObject({ message: 'already_signed' });
    });

    it('409 already_declined when signer has already declined', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      const env = repo.envelopes.get(envId)!;
      const next: Envelope = {
        ...env,
        signers: env.signers.map((s) =>
          s.id === signerId
            ? { ...s, declined_at: new Date().toISOString(), status: 'declined' }
            : s,
        ),
      } as Envelope;
      repo.envelopes.set(envId, next);
      await expect(
        svc.remindSigner(OWNER, envId, signerId, { email: 'a@b.com' }),
      ).rejects.toMatchObject({ message: 'already_declined' });
    });

    it('409 envelope_terminal when token rotation loses the race even though pre-checks passed', async () => {
      const { envId, signerId } = await setupSentEnvelope();
      // Past the throttle window so we reach the rotate call.
      for (const row of outbound.rows) {
        (row as { created_at: string }).created_at = new Date(
          Date.now() - 2 * 60 * 60 * 1000,
        ).toISOString();
      }
      // Simulate a concurrent action that flipped the envelope between the
      // service's read and rotateSignerAccessToken's atomic update.
      repo.failNextRotate = true;
      // Then mutate the envelope underfoot so the re-read disambiguates.
      const env = repo.envelopes.get(envId)!;
      repo.envelopes.set(envId, { ...env, status: 'completed' } as Envelope);
      await expect(
        svc.remindSigner(OWNER, envId, signerId, { email: 'a@b.com' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('cancel — concurrent withdraw race', () => {
    async function setupSent() {
      const { envId } = await buildReadyDraft();
      await svc.send(OWNER, envId, { email: 'sender@example.com' });
      return envId;
    }

    it('two parallel withdraws → one resolves, one 409 envelope_terminal', async () => {
      const envId = await setupSent();
      const [a, b] = await Promise.allSettled([svc.cancel(OWNER, envId), svc.cancel(OWNER, envId)]);
      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
      const rejected = [a, b].filter((r) => r.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
      expect(repo.envelopes.get(envId)?.status).toBe('canceled');
    });
  });
});
