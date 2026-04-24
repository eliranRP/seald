import { randomUUID } from 'node:crypto';
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
  SetOriginalFileInput,
  SetSignerSignatureInput,
  SignerFieldFillInput,
  SubmitResult,
  UpdateDraftMetadataPatch,
} from '../src/envelopes/envelopes.repository';
import {
  EnvelopeSignerEmailTakenError,
  EnvelopesRepository,
  InvalidCursorError,
  ShortCodeCollisionError,
} from '../src/envelopes/envelopes.repository';

/**
 * In-memory envelopes repository for e2e tests. Covers the subset of methods
 * the sender controller exercises (draft composition + event append).
 * Methods used by the signer + worker flows throw `not_implemented_in_fake`
 * and will be fleshed out as Phase 3c–3e e2e tests land.
 */
export class InMemoryEnvelopesRepository extends EnvelopesRepository {
  readonly envelopes = new Map<string, Envelope>();
  readonly events: EnvelopeEvent[] = [];
  readonly shortCodes = new Set<string>();

  reset(): void {
    this.envelopes.clear();
    this.events.length = 0;
    this.shortCodes.clear();
  }

  async createDraft(input: CreateDraftInput): Promise<Envelope> {
    if (this.shortCodes.has(input.short_code)) throw new ShortCodeCollisionError();
    this.shortCodes.add(input.short_code);
    const now = new Date().toISOString();
    const env: Envelope = {
      id: randomUUID(),
      owner_id: input.owner_id,
      title: input.title,
      short_code: input.short_code,
      status: 'draft',
      delivery_mode: 'parallel',
      original_pages: null,
      original_sha256: null,
      sealed_sha256: null,
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

  async findByIdForOwner(owner_id: string, id: string): Promise<Envelope | null> {
    const e = this.envelopes.get(id);
    return e && e.owner_id === owner_id ? e : null;
  }

  async findByIdWithAll(id: string): Promise<Envelope | null> {
    return this.envelopes.get(id) ?? null;
  }

  async findByShortCode(short_code: string): Promise<Envelope | null> {
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
    if (opts.statuses) {
      const set = new Set(opts.statuses);
      items = items.filter((e) => set.has(e.status));
    }
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
  ): Promise<Envelope | null> {
    const e = await this.findByIdForOwner(owner_id, envelope_id);
    if (!e || e.status !== 'draft') return null;
    const next: Envelope = { ...e, ...patch, updated_at: new Date().toISOString() };
    this.envelopes.set(envelope_id, next);
    return next;
  }

  async deleteDraft(owner_id: string, envelope_id: string): Promise<boolean> {
    const e = await this.findByIdForOwner(owner_id, envelope_id);
    if (!e || e.status !== 'draft') return false;
    this.envelopes.delete(envelope_id);
    return true;
  }

  async setOriginalFile(
    envelope_id: string,
    input: SetOriginalFileInput,
  ): Promise<Envelope | null> {
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
    if (e.signers.some((s) => s.email.toLowerCase() === input.email.toLowerCase())) {
      throw new EnvelopeSignerEmailTakenError();
    }
    const signer: EnvelopeSigner = {
      id: randomUUID(),
      email: input.email,
      name: input.name,
      color: input.color,
      role: input.role ?? 'signatory',
      signing_order: 1,
      status: 'awaiting',
      viewed_at: null,
      signed_at: null,
      declined_at: null,
    };
    this.envelopes.set(envelope_id, { ...e, signers: [...e.signers, signer] });
    return signer;
  }

  async removeSigner(envelope_id: string, signer_id: string): Promise<boolean> {
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
    const mapped: EnvelopeField[] = fields.map((f) => ({
      id: randomUUID(),
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
      id: randomUUID(),
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
