import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import type {
  Database,
  EnvelopesTable,
  EnvelopeSignersTable,
  EnvelopeFieldsTable,
  EnvelopeEventsTable,
} from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import type { Envelope, EnvelopeSigner, EnvelopeField, EnvelopeEvent } from './envelope.entity';
import {
  EnvelopesRepository,
  EnvelopeSignerEmailTakenError,
  EnvelopeTerminalError,
  InvalidCursorError,
  ShortCodeCollisionError,
  type AddSignerInput,
  type CreateDraftInput,
  type CreateFieldInput,
  type EventInput,
  type ListOptions,
  type ListResult,
  type EnvelopeListItem,
  type SendDraftInput,
  type SetOriginalFileInput,
  type SetSignerSignatureInput,
  type SignerFieldFillInput,
  type SubmitResult,
  type UpdateDraftMetadataPatch,
} from './envelopes.repository';

type EnvelopeRow = Selectable<EnvelopesTable>;
type SignerRow = Selectable<EnvelopeSignersTable>;
type FieldRow = Selectable<EnvelopeFieldsTable>;
type EventRow = Selectable<EnvelopeEventsTable>;

/**
 * Postgres error 23505 = unique_violation. The only uniqueness on
 * envelope_signers we map to a domain error is (envelope_id, email).
 * pg-mem does not populate `constraint` — instead, it leaks the column
 * tuple in the message. Match both shapes.
 */
/**
 * Detect a 23505 unique violation against envelopes.short_code. Real Postgres
 * exposes `constraint = 'envelopes_short_code_key'`; pg-mem embeds the
 * column info in the message text.
 */
function isShortCodeUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  if (e.constraint === 'envelopes_short_code_key') return true;
  if (typeof e.message === 'string' && e.message.toLowerCase().includes('short_code')) return true;
  return false;
}

function isSignerEmailUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  if (e.constraint === 'envelope_signers_envelope_id_email_key') return true;
  if (
    typeof e.message === 'string' &&
    e.message.includes('envelope_signers_envelope_id_email_key')
  ) {
    return true;
  }
  if (typeof e.message === 'string' && e.message.includes('Key (envelope_id,email)')) {
    return true;
  }
  return false;
}

function toIso(d: Date | null): string | null {
  return d === null ? null : new Date(d).toISOString();
}
function toIsoReq(d: Date): string {
  return new Date(d).toISOString();
}
function asNumber(v: unknown): number {
  // pg-mem sometimes returns numeric columns (x,y,width,height) as strings.
  return typeof v === 'string' ? Number(v) : (v as number);
}
function asNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return asNumber(v);
}

function deriveSignerStatus(row: SignerRow): EnvelopeSigner['status'] {
  if (row.declined_at !== null) return 'declined';
  if (row.signed_at !== null) return 'completed';
  if (row.viewed_at !== null) return 'viewing';
  return 'awaiting';
}

function toSignerDomain(row: SignerRow): EnvelopeSigner {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    color: row.color,
    role: row.role,
    signing_order: row.signing_order,
    status: deriveSignerStatus(row),
    viewed_at: toIso(row.viewed_at),
    signed_at: toIso(row.signed_at),
    declined_at: toIso(row.declined_at),
  };
}

function toFieldDomain(row: FieldRow): EnvelopeField {
  return {
    id: row.id,
    signer_id: row.signer_id,
    kind: row.kind,
    page: row.page,
    x: asNumber(row.x),
    y: asNumber(row.y),
    width: asNullableNumber(row.width),
    height: asNullableNumber(row.height),
    required: row.required,
    link_id: row.link_id,
    value_text: row.value_text,
    value_boolean: row.value_boolean,
    filled_at: toIso(row.filled_at),
  };
}

function toEnvelopeDomain(
  envelope: EnvelopeRow,
  signers: ReadonlyArray<SignerRow>,
  fields: ReadonlyArray<FieldRow>,
): Envelope {
  return {
    id: envelope.id,
    owner_id: envelope.owner_id,
    title: envelope.title,
    short_code: envelope.short_code,
    status: envelope.status,
    delivery_mode: envelope.delivery_mode,
    original_pages: envelope.original_pages,
    original_sha256: envelope.original_sha256,
    sealed_sha256: envelope.sealed_sha256,
    sent_at: toIso(envelope.sent_at),
    completed_at: toIso(envelope.completed_at),
    expires_at: toIsoReq(envelope.expires_at),
    tc_version: envelope.tc_version,
    privacy_version: envelope.privacy_version,
    signers: signers.map(toSignerDomain),
    fields: fields.map(toFieldDomain),
    created_at: toIsoReq(envelope.created_at),
    updated_at: toIsoReq(envelope.updated_at),
  };
}

function toEventDomain(row: EventRow): EnvelopeEvent {
  // Postgres JSONB returns an object directly; pg-mem also returns an object.
  // If it ever arrives as a string (depending on driver config), parse it.
  let metadata: Record<string, unknown>;
  if (typeof row.metadata === 'string') {
    metadata = JSON.parse(row.metadata) as Record<string, unknown>;
  } else {
    metadata = (row.metadata ?? {}) as Record<string, unknown>;
  }
  return {
    id: row.id,
    envelope_id: row.envelope_id,
    signer_id: row.signer_id,
    actor_kind: row.actor_kind,
    event_type: row.event_type,
    ip: row.ip,
    user_agent: row.user_agent,
    metadata,
    created_at: toIsoReq(row.created_at),
  };
}

function toListItem(row: EnvelopeRow): EnvelopeListItem {
  return {
    id: row.id,
    title: row.title,
    short_code: row.short_code,
    status: row.status,
    original_pages: row.original_pages,
    sent_at: toIso(row.sent_at),
    completed_at: toIso(row.completed_at),
    expires_at: toIsoReq(row.expires_at),
    created_at: toIsoReq(row.created_at),
    updated_at: toIsoReq(row.updated_at),
  };
}

function encodeCursor(updated_at: string, id: string): string {
  return Buffer.from(`${updated_at}|${id}`, 'utf8').toString('base64');
}
function decodeCursor(cursor: string): { updated_at: string; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64').toString('utf8');
  } catch {
    throw new InvalidCursorError();
  }
  const pipe = decoded.indexOf('|');
  if (pipe <= 0 || pipe === decoded.length - 1) throw new InvalidCursorError();
  const updated_at = decoded.slice(0, pipe);
  const id = decoded.slice(pipe + 1);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(updated_at)) throw new InvalidCursorError();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new InvalidCursorError();
  return { updated_at, id };
}

@Injectable()
export class EnvelopesPgRepository extends EnvelopesRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  // ---------- Reads ----------

  async createDraft(input: CreateDraftInput): Promise<Envelope> {
    try {
      const row = await this.db
        .insertInto('envelopes')
        .values({
          owner_id: input.owner_id,
          title: input.title,
          short_code: input.short_code,
          tc_version: input.tc_version,
          privacy_version: input.privacy_version,
          expires_at: input.expires_at,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      // A fresh draft has no signers or fields yet.
      return toEnvelopeDomain(row, [], []);
    } catch (err) {
      if (isShortCodeUniqueViolation(err)) throw new ShortCodeCollisionError();
      throw err;
    }
  }

  async findByIdForOwner(owner_id: string, envelope_id: string): Promise<Envelope | null> {
    const row = await this.db
      .selectFrom('envelopes')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', envelope_id)
      .executeTakeFirst();
    if (!row) return null;
    const [signers, fields] = await Promise.all([
      this.loadSigners(envelope_id),
      this.loadFields(envelope_id),
    ]);
    return toEnvelopeDomain(row, signers, fields);
  }

  async findByIdWithAll(envelope_id: string): Promise<Envelope | null> {
    const row = await this.db
      .selectFrom('envelopes')
      .selectAll()
      .where('id', '=', envelope_id)
      .executeTakeFirst();
    if (!row) return null;
    const [signers, fields] = await Promise.all([
      this.loadSigners(envelope_id),
      this.loadFields(envelope_id),
    ]);
    return toEnvelopeDomain(row, signers, fields);
  }

  async findByShortCode(short_code: string): Promise<Envelope | null> {
    const row = await this.db
      .selectFrom('envelopes')
      .selectAll()
      .where('short_code', '=', short_code)
      .executeTakeFirst();
    if (!row) return null;
    // Public verify flow — masking is applied by the service layer. Repo
    // still returns the full aggregate so the service can compute signer
    // names/emails masked.
    const [signers, fields] = await Promise.all([
      this.loadSigners(row.id),
      this.loadFields(row.id),
    ]);
    return toEnvelopeDomain(row, signers, fields);
  }

  async findSignerByAccessTokenHash(
    hash: string,
  ): Promise<{ envelope: Envelope; signer: EnvelopeSigner } | null> {
    const signerRow = await this.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('access_token_hash', '=', hash)
      .executeTakeFirst();
    if (!signerRow) return null;
    const envelope = await this.findByIdWithAll(signerRow.envelope_id);
    if (!envelope) return null;
    return { envelope, signer: toSignerDomain(signerRow) };
  }

  async listByOwner(owner_id: string, opts: ListOptions): Promise<ListResult> {
    let q = this.db
      .selectFrom('envelopes')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .orderBy('updated_at', 'desc')
      .orderBy('id', 'desc')
      .limit(opts.limit + 1);
    if (opts.statuses && opts.statuses.length > 0) {
      q = q.where('status', 'in', [...opts.statuses]);
    }
    if (opts.cursor) {
      const c = opts.cursor;
      // Keyset: (updated_at, id) < (cursor.updated_at, cursor.id), desc order.
      // `updated_at` is typed with `never` for the writes-side of Kysely's
      // ColumnType, so we compare via sql. pg-mem does not implement the
      // row-value comparison form `(a,b) < (c,d)`, so we spell it out as an
      // explicit OR/AND — this also matches verbatim what real Postgres does
      // under the hood for row comparisons.
      q = q.where(
        sql<boolean>`(updated_at < ${sql.lit(c.updated_at)}::timestamptz) or (updated_at = ${sql.lit(c.updated_at)}::timestamptz and id < ${sql.lit(c.id)}::uuid)`,
      );
    }
    const rows = await q.execute();
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;
    const items = page.map(toListItem);
    const last = page[page.length - 1];
    const next_cursor = hasMore && last ? encodeCursor(toIsoReq(last.updated_at), last.id) : null;
    return { items, next_cursor };
  }

  async listEventsForEnvelope(envelope_id: string): Promise<ReadonlyArray<EnvelopeEvent>> {
    const rows = await this.db
      .selectFrom('envelope_events')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return rows.map(toEventDomain);
  }

  // Decode helper exposed for the service layer — keeps base64 format internal
  // to the adapter. Not part of the port because cursors are a repo concern.
  decodeCursorOrThrow(cursor: string): { updated_at: string; id: string } {
    return decodeCursor(cursor);
  }

  // ---------- Draft composition ----------

  async updateDraftMetadata(
    owner_id: string,
    envelope_id: string,
    patch: UpdateDraftMetadataPatch,
  ): Promise<Envelope | null> {
    if (Object.keys(patch).length === 0) {
      return this.findByIdForOwner(owner_id, envelope_id);
    }
    const res = await this.db
      .updateTable('envelopes')
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where('owner_id', '=', owner_id)
      .where('id', '=', envelope_id)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    if ((res?.numUpdatedRows ?? 0n) === 0n) return null;
    return this.findByIdForOwner(owner_id, envelope_id);
  }

  async deleteDraft(owner_id: string, envelope_id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('envelopes')
      .where('owner_id', '=', owner_id)
      .where('id', '=', envelope_id)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    return (res?.numDeletedRows ?? 0n) > 0n;
  }

  async setOriginalFile(
    envelope_id: string,
    input: SetOriginalFileInput,
  ): Promise<Envelope | null> {
    const res = await this.db
      .updateTable('envelopes')
      .set({
        original_file_path: input.file_path,
        original_sha256: input.sha256,
        original_pages: input.pages,
        updated_at: new Date().toISOString(),
      })
      .where('id', '=', envelope_id)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    if ((res?.numUpdatedRows ?? 0n) === 0n) return null;
    return this.findByIdWithAll(envelope_id);
  }

  async addSigner(envelope_id: string, input: AddSignerInput): Promise<EnvelopeSigner> {
    try {
      const row = await this.db
        .insertInto('envelope_signers')
        .values({
          envelope_id,
          contact_id: input.contact_id ?? null,
          email: input.email,
          name: input.name,
          color: input.color,
          role: input.role,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toSignerDomain(row);
    } catch (err) {
      if (isSignerEmailUniqueViolation(err)) throw new EnvelopeSignerEmailTakenError();
      throw err;
    }
  }

  async removeSigner(envelope_id: string, signer_id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('envelope_signers')
      .where('envelope_id', '=', envelope_id)
      .where('id', '=', signer_id)
      .executeTakeFirst();
    return (res?.numDeletedRows ?? 0n) > 0n;
  }

  async replaceFields(
    envelope_id: string,
    fields: ReadonlyArray<CreateFieldInput>,
  ): Promise<ReadonlyArray<EnvelopeField>> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('envelope_fields').where('envelope_id', '=', envelope_id).execute();
      if (fields.length === 0) return [];
      const rows = await trx
        .insertInto('envelope_fields')
        .values(
          fields.map((f) => ({
            envelope_id,
            signer_id: f.signer_id,
            kind: f.kind,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width ?? null,
            height: f.height ?? null,
            required: f.required,
            link_id: f.link_id ?? null,
          })),
        )
        .returningAll()
        .execute();
      return rows.map(toFieldDomain);
    });
  }

  // ---------- Send + lifecycle ----------

  async sendDraft(input: SendDraftInput): Promise<Envelope | null> {
    return this.db.transaction().execute(async (trx) => {
      const now = new Date().toISOString();
      const res = await trx
        .updateTable('envelopes')
        .set({ status: 'awaiting_others', sent_at: now, updated_at: now })
        .where('id', '=', input.envelope_id)
        .where('status', '=', 'draft')
        .executeTakeFirst();
      if ((res?.numUpdatedRows ?? 0n) === 0n) return null;
      for (const t of input.signer_tokens) {
        await trx
          .updateTable('envelope_signers')
          .set({ access_token_hash: t.access_token_hash, access_token_sent_at: now })
          .where('id', '=', t.signer_id)
          .where('envelope_id', '=', input.envelope_id)
          .execute();
      }
      return this.findByIdWithAllTrx(trx, input.envelope_id);
    });
  }

  async rotateSignerAccessToken(
    signer_id: string,
    new_access_token_hash: string,
  ): Promise<boolean> {
    // Guarded: only rotate when the parent envelope is 'awaiting_others' and
    // the signer has neither signed nor declined. Two-step look-before-update
    // so we can condition on the parent's status without pg-mem's JOIN quirks.
    return this.db.transaction().execute(async (trx) => {
      const signer = await trx
        .selectFrom('envelope_signers')
        .select(['id', 'envelope_id', 'signed_at', 'declined_at'])
        .where('id', '=', signer_id)
        .executeTakeFirst();
      if (!signer) return false;
      if (signer.signed_at !== null || signer.declined_at !== null) return false;

      const envelope = await trx
        .selectFrom('envelopes')
        .select(['status'])
        .where('id', '=', signer.envelope_id)
        .executeTakeFirst();
      if (!envelope || envelope.status !== 'awaiting_others') return false;

      const res = await trx
        .updateTable('envelope_signers')
        .set({
          access_token_hash: new_access_token_hash,
          access_token_sent_at: new Date().toISOString(),
        })
        .where('id', '=', signer_id)
        .where('signed_at', 'is', null)
        .where('declined_at', 'is', null)
        .executeTakeFirst();
      return (res?.numUpdatedRows ?? 0n) > 0n;
    });
  }

  async recordSignerViewed(
    signer_id: string,
    ip: string | null,
    user_agent: string | null,
  ): Promise<EnvelopeSigner> {
    // Idempotent: only stamp on first view. Subsequent calls simply re-read.
    const existing = await this.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('id', '=', signer_id)
      .executeTakeFirstOrThrow();
    if (existing.viewed_at !== null) {
      return toSignerDomain(existing);
    }
    const now = new Date().toISOString();
    const row = await this.db
      .updateTable('envelope_signers')
      .set({
        viewed_at: now,
        signing_ip: ip,
        signing_user_agent: user_agent,
      })
      .where('id', '=', signer_id)
      .where('viewed_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    // If another request won the race, re-read.
    if (!row) {
      const fresh = await this.db
        .selectFrom('envelope_signers')
        .selectAll()
        .where('id', '=', signer_id)
        .executeTakeFirstOrThrow();
      return toSignerDomain(fresh);
    }
    return toSignerDomain(row);
  }

  async acceptTerms(signer_id: string): Promise<EnvelopeSigner> {
    const existing = await this.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('id', '=', signer_id)
      .executeTakeFirstOrThrow();
    if (existing.tc_accepted_at !== null) {
      return toSignerDomain(existing);
    }
    const now = new Date().toISOString();
    const row = await this.db
      .updateTable('envelope_signers')
      .set({ tc_accepted_at: now })
      .where('id', '=', signer_id)
      .where('tc_accepted_at', 'is', null)
      .returningAll()
      .executeTakeFirst();
    if (!row) {
      const fresh = await this.db
        .selectFrom('envelope_signers')
        .selectAll()
        .where('id', '=', signer_id)
        .executeTakeFirstOrThrow();
      return toSignerDomain(fresh);
    }
    return toSignerDomain(row);
  }

  async fillField(
    field_id: string,
    signer_id: string,
    value: SignerFieldFillInput,
  ): Promise<EnvelopeField | null> {
    const now = new Date().toISOString();
    const row = await this.db
      .updateTable('envelope_fields')
      .set({
        value_text: value.value_text ?? null,
        value_boolean: value.value_boolean ?? null,
        filled_at: now,
      })
      .where('id', '=', field_id)
      .where('signer_id', '=', signer_id)
      .returningAll()
      .executeTakeFirst();
    return row ? toFieldDomain(row) : null;
  }

  async setSignerSignature(
    signer_id: string,
    input: SetSignerSignatureInput,
  ): Promise<EnvelopeSigner> {
    const row = await this.db
      .updateTable('envelope_signers')
      .set({
        signature_format: input.signature_format,
        signature_image_path: input.signature_image_path,
        signature_font: input.signature_font ?? null,
        signature_stroke_count: input.signature_stroke_count ?? null,
        signature_source_filename: input.signature_source_filename ?? null,
      })
      .where('id', '=', signer_id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toSignerDomain(row);
  }

  async submitSigner(
    signer_id: string,
    ip: string | null,
    user_agent: string | null,
  ): Promise<SubmitResult | null> {
    return this.db.transaction().execute(async (trx) => {
      // pg-mem does not implement SELECT ... FOR UPDATE locking semantics,
      // but the row-conditional UPDATE below (where signed_at is null) is
      // sufficient on its own — whichever writer updates the row first wins
      // and the second gets 0 rows.
      const existing = await trx
        .selectFrom('envelope_signers')
        .selectAll()
        .where('id', '=', signer_id)
        .executeTakeFirst();
      if (!existing) return null;
      if (existing.signed_at !== null) return null;
      if (existing.declined_at !== null) return null;
      if (existing.tc_accepted_at === null) return null;
      if (existing.signature_format === null) return null;

      const now = new Date().toISOString();
      const signerRow = await trx
        .updateTable('envelope_signers')
        .set({
          signed_at: now,
          signing_ip: ip,
          signing_user_agent: user_agent,
        })
        .where('id', '=', signer_id)
        .where('signed_at', 'is', null)
        .returningAll()
        .executeTakeFirst();
      if (!signerRow) return null;

      // Count remaining signers for the parent envelope.
      const counts = await trx
        .selectFrom('envelope_signers')
        .select(({ fn }) => [
          fn.countAll<string>().as('total'),
          fn.sum<string>(sql<number>`case when signed_at is not null then 1 else 0 end`).as('done'),
        ])
        .where('envelope_id', '=', existing.envelope_id)
        .executeTakeFirstOrThrow();
      const total = Number(counts.total);
      const done = Number(counts.done);
      const all_signed = done === total;

      let envelope_status: Envelope['status'];
      if (all_signed) {
        const transition = await trx
          .updateTable('envelopes')
          .set({ status: 'sealing', updated_at: now })
          .where('id', '=', existing.envelope_id)
          .where('status', '=', 'awaiting_others')
          .returning(['status'])
          .executeTakeFirst();
        if (transition) {
          envelope_status = transition.status;
        } else {
          const current = await trx
            .selectFrom('envelopes')
            .select(['status'])
            .where('id', '=', existing.envelope_id)
            .executeTakeFirstOrThrow();
          envelope_status = current.status;
        }
      } else {
        const current = await trx
          .selectFrom('envelopes')
          .select(['status'])
          .where('id', '=', existing.envelope_id)
          .executeTakeFirstOrThrow();
        envelope_status = current.status;
      }

      return {
        signer: toSignerDomain(signerRow),
        all_signed,
        envelope_status,
      };
    });
  }

  async declineSigner(
    signer_id: string,
    reason: string | null,
    ip: string | null,
    user_agent: string | null,
  ): Promise<Envelope | null> {
    return this.db.transaction().execute(async (trx) => {
      const existing = await trx
        .selectFrom('envelope_signers')
        .selectAll()
        .where('id', '=', signer_id)
        .executeTakeFirst();
      if (!existing) return null;
      // Already-terminal signer: caller maps to 409.
      if (existing.signed_at !== null) return null;
      if (existing.declined_at !== null) return null;

      const now = new Date().toISOString();
      const updated = await trx
        .updateTable('envelope_signers')
        .set({
          declined_at: now,
          decline_reason: reason,
          signing_ip: ip,
          signing_user_agent: user_agent,
        })
        .where('id', '=', signer_id)
        .where('declined_at', 'is', null)
        .where('signed_at', 'is', null)
        .executeTakeFirst();
      if ((updated?.numUpdatedRows ?? 0n) === 0n) return null;

      const envTransition = await trx
        .updateTable('envelopes')
        .set({ status: 'declined', updated_at: now })
        .where('id', '=', existing.envelope_id)
        .where('status', '=', 'awaiting_others')
        .returning(['status'])
        .executeTakeFirst();
      if (!envTransition) {
        // Envelope is in a non-awaiting_others state — terminal or still
        // draft, neither of which is valid for decline.
        const current = await trx
          .selectFrom('envelopes')
          .select(['status'])
          .where('id', '=', existing.envelope_id)
          .executeTakeFirstOrThrow();
        throw new EnvelopeTerminalError(current.status);
      }

      return this.findByIdWithAllTrx(trx, existing.envelope_id);
    });
  }

  async expireEnvelopes(now: Date, limit: number): Promise<ReadonlyArray<string>> {
    // pg-mem does not support UPDATE ... LIMIT, so we select-then-update.
    // On real Postgres this is also safe: the SELECT lists candidates and
    // each UPDATE is row-conditional on status='awaiting_others', so concurrent
    // transitions (e.g. signer submits at the same time) will return 0 rows
    // for the losers without touching the row.
    const candidates = await this.db
      .selectFrom('envelopes')
      .select(['id'])
      .where('status', '=', 'awaiting_others')
      .where(sql<boolean>`expires_at < ${sql.lit(now.toISOString())}::timestamptz`)
      .orderBy('expires_at', 'asc')
      .limit(limit)
      .execute();
    const transitioned: string[] = [];
    for (const c of candidates) {
      const res = await this.db
        .updateTable('envelopes')
        .set({ status: 'expired', updated_at: new Date().toISOString() })
        .where('id', '=', c.id)
        .where('status', '=', 'awaiting_others')
        .executeTakeFirst();
      if ((res?.numUpdatedRows ?? 0n) > 0n) transitioned.push(c.id);
    }
    return transitioned;
  }

  // ---------- Audit ----------

  async appendEvent(input: EventInput): Promise<EnvelopeEvent> {
    const row = await this.db
      .insertInto('envelope_events')
      .values({
        envelope_id: input.envelope_id,
        signer_id: input.signer_id ?? null,
        actor_kind: input.actor_kind,
        event_type: input.event_type,
        ip: input.ip ?? null,
        user_agent: input.user_agent ?? null,
        metadata: JSON.stringify(input.metadata ?? {}),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toEventDomain(row);
  }

  // ---------- Jobs ----------

  async enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only'): Promise<string> {
    // Atomic upsert on the unique (envelope_id) column: if a job row already
    // exists (e.g. a failed seal that's about to be replaced with audit_only),
    // re-arm it back to pending and reset attempts/error so the worker picks
    // it up again.
    const row = await this.db
      .insertInto('envelope_jobs')
      .values({ envelope_id, kind })
      .onConflict((oc) =>
        oc.column('envelope_id').doUpdateSet({
          kind,
          status: 'pending',
          attempts: 0,
          last_error: null,
          scheduled_for: new Date().toISOString(),
          started_at: null,
          finished_at: null,
        }),
      )
      .returning(['id'])
      .executeTakeFirstOrThrow();
    return row.id;
  }

  // ---------- Internal helpers ----------

  private async loadSigners(envelope_id: string): Promise<ReadonlyArray<SignerRow>> {
    return this.db
      .selectFrom('envelope_signers')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('signing_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
  }

  private async loadFields(envelope_id: string): Promise<ReadonlyArray<FieldRow>> {
    return this.db
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('page', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
  }

  private async findByIdWithAllTrx(
    trx: Transaction<Database>,
    envelope_id: string,
  ): Promise<Envelope | null> {
    const row = await trx
      .selectFrom('envelopes')
      .selectAll()
      .where('id', '=', envelope_id)
      .executeTakeFirst();
    if (!row) return null;
    const signers = await trx
      .selectFrom('envelope_signers')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('signing_order', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    const fields = await trx
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('page', 'asc')
      .orderBy('created_at', 'asc')
      .execute();
    return toEnvelopeDomain(row, signers, fields);
  }
}
