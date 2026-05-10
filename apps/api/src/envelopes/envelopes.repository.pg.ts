import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable, type Transaction } from 'kysely';
import { eventHash } from './event-hash';
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
  type ClaimedJob,
  type SetSignerSignatureInput,
  type SignerAuditDetail,
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
  const pgError = err as { code?: string; constraint?: string; message?: string };
  if (pgError.code !== '23505') return false;
  if (pgError.constraint === 'envelopes_short_code_key') return true;
  if (typeof pgError.message === 'string' && pgError.message.toLowerCase().includes('short_code'))
    return true;
  return false;
}

function isPrevHashUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const pgError = err as { code?: string; constraint?: string; message?: string };
  if (pgError.code !== '23505') return false;
  if (pgError.constraint === 'envelope_events_envelope_prev_hash_unique') return true;
  if (
    typeof pgError.message === 'string' &&
    pgError.message.includes('envelope_events_envelope_prev_hash_unique')
  ) {
    return true;
  }
  return false;
}

function isSignerEmailUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const pgError = err as { code?: string; constraint?: string; message?: string };
  if (pgError.code !== '23505') return false;
  if (pgError.constraint === 'envelope_signers_envelope_id_email_key') return true;
  if (
    typeof pgError.message === 'string' &&
    pgError.message.includes('envelope_signers_envelope_id_email_key')
  ) {
    return true;
  }
  if (typeof pgError.message === 'string' && pgError.message.includes('Key (envelope_id,email)')) {
    return true;
  }
  return false;
}

function toIso(date: Date | null): string | null {
  return date === null ? null : new Date(date).toISOString();
}
function toIsoRequired(date: Date): string {
  return new Date(date).toISOString();
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
    tc_accepted_at: toIso(row.tc_accepted_at),
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
    sender_email: envelope.sender_email,
    sender_name: envelope.sender_name,
    sent_at: toIso(envelope.sent_at),
    completed_at: toIso(envelope.completed_at),
    expires_at: toIsoRequired(envelope.expires_at),
    tags: [...(envelope.tags ?? [])],
    tc_version: envelope.tc_version,
    privacy_version: envelope.privacy_version,
    signers: signers.map(toSignerDomain),
    fields: fields.map(toFieldDomain),
    created_at: toIsoRequired(envelope.created_at),
    updated_at: toIsoRequired(envelope.updated_at),
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
    created_at: toIsoRequired(row.created_at),
  };
}

function toListItem(row: EnvelopeRow, signerRows: ReadonlyArray<SignerRow>): EnvelopeListItem {
  return {
    id: row.id,
    title: row.title,
    short_code: row.short_code,
    status: row.status,
    original_pages: row.original_pages,
    sent_at: toIso(row.sent_at),
    completed_at: toIso(row.completed_at),
    expires_at: toIsoRequired(row.expires_at),
    tags: (row.tags ?? []) as ReadonlyArray<string>,
    created_at: toIsoRequired(row.created_at),
    updated_at: toIsoRequired(row.updated_at),
    signers: signerRows.map((s) => ({
      id: s.id,
      name: s.name,
      email: s.email,
      color: s.color,
      status: deriveSignerStatus(s),
      signed_at: toIso(s.signed_at),
    })),
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
      const cursor = opts.cursor;
      // Keyset: (updated_at, id) < (cursor.updated_at, cursor.id), desc order.
      // `updated_at` is typed with `never` for the writes-side of Kysely's
      // ColumnType, so we compare via sql. pg-mem does not implement the
      // row-value comparison form `(a,b) < (c,d)`, so we spell it out as an
      // explicit OR/AND — this also matches verbatim what real Postgres does
      // under the hood for row comparisons.
      q = q.where(
        sql<boolean>`(updated_at < ${sql.lit(cursor.updated_at)}::timestamptz) or (updated_at = ${sql.lit(cursor.updated_at)}::timestamptz and id < ${sql.lit(cursor.id)}::uuid)`,
      );
    }
    const rows = await q.execute();
    const hasMore = rows.length > opts.limit;
    const page = hasMore ? rows.slice(0, opts.limit) : rows;

    // Fetch signers for the returned envelopes in a single query and group
    // client-side. Dashboard renders SignerStack per row; without this the
    // UI would fan out to N+1 envelope reads.
    const envelopeIds = page.map((r) => r.id);
    const signerRows = envelopeIds.length
      ? await this.db
          .selectFrom('envelope_signers')
          .selectAll()
          .where('envelope_id', 'in', envelopeIds)
          .orderBy('signing_order', 'asc')
          .execute()
      : [];
    const signersByEnvelope = new Map<string, SignerRow[]>();
    for (const s of signerRows) {
      const arr = signersByEnvelope.get(s.envelope_id) ?? [];
      arr.push(s);
      signersByEnvelope.set(s.envelope_id, arr);
    }

    const items = page.map((row) => toListItem(row, signersByEnvelope.get(row.id) ?? []));
    const last = page[page.length - 1];
    const next_cursor =
      hasMore && last ? encodeCursor(toIsoRequired(last.updated_at), last.id) : null;
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

  async verifyEventChain(envelope_id: string): Promise<{ readonly chain_intact: boolean }> {
    const rows = await this.db
      .selectFrom('envelope_events')
      .selectAll()
      .where('envelope_id', '=', envelope_id)
      .orderBy('created_at', 'asc')
      .orderBy('id', 'asc')
      .execute();
    if (rows.length === 0) return { chain_intact: true };

    // Genesis event must have NULL prev_event_hash. Anything else means a
    // row was deleted upstream (the genesis we have was actually a child).
    const genesis = rows[0]!;
    if (genesis.prev_event_hash !== null && genesis.prev_event_hash !== undefined) {
      return { chain_intact: false };
    }

    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1]!;
      const curr = rows[i]!;
      const expected = eventHash(toEventDomain(prev));
      const stored = curr.prev_event_hash;
      if (!stored) return { chain_intact: false };
      // pg returns Buffer, pg-mem may return Uint8Array — coerce.
      const storedBuf = Buffer.isBuffer(stored) ? stored : Buffer.from(stored as Uint8Array);
      if (storedBuf.length !== expected.length) return { chain_intact: false };
      if (!storedBuf.equals(expected)) return { chain_intact: false };
    }
    return { chain_intact: true };
  }

  async listSignerAuditDetails(envelope_id: string): Promise<ReadonlyArray<SignerAuditDetail>> {
    const rows = await this.db
      .selectFrom('envelope_signers')
      .select(['id', 'signature_format', 'signature_font', 'verification_checks', 'signing_ip'])
      .where('envelope_id', '=', envelope_id)
      .execute();
    return rows.map((r) => ({
      signer_id: r.id,
      signature_format: r.signature_format,
      signature_font: r.signature_font,
      verification_checks: r.verification_checks ?? [],
      signing_ip: r.signing_ip,
    }));
  }

  // Issue #46 — exposes the raw image paths (excluded from the domain
  // Signer for wire-contract hygiene) to the DSAR export so signed-URL
  // generation can attach short-TTL fetch handles for each capture.
  async listSignerImagePaths(envelope_id: string): Promise<
    ReadonlyArray<{
      readonly signer_id: string;
      readonly signature_image_path: string | null;
      readonly initials_image_path: string | null;
    }>
  > {
    const rows = await this.db
      .selectFrom('envelope_signers')
      .select(['id', 'signature_image_path', 'initials_image_path'])
      .where('envelope_id', '=', envelope_id)
      .execute();
    return rows.map((r) => ({
      signer_id: r.id,
      signature_image_path: r.signature_image_path,
      initials_image_path: r.initials_image_path,
    }));
  }

  /**
   * Issues #38 / #43 — atomic account-deletion purge.
   *
   * Wraps every step in a single transaction so a partial failure (e.g.
   * a unique-violation race on the audit chain) rolls back and the
   * caller can retry. The rationale for the four steps is documented on
   * the port; this implementation keeps the SQL narrow enough to audit.
   *
   * NOTE: signer-row anonymization uses a placeholder email of
   * `<email_hash>@deleted.invalid` (RFC 2606 reserved TLD) so the row
   * remains valid for any downstream renderer while carrying zero PII.
   */
  async purgeOwnedDataForAccountDeletion(input: {
    readonly owner_id: string;
    readonly email: string | null;
    readonly email_hash: string;
  }): Promise<{
    readonly drafts_deleted: number;
    readonly envelopes_preserved: number;
    readonly signers_anonymized: number;
    readonly retention_events_appended: number;
  }> {
    return this.db.transaction().execute(async (trx) => {
      // 1. Hard-delete drafts. They have no statutory retention — they
      //    were never sent, never signed, never sealed. Cascades on
      //    envelope_signers / envelope_fields / envelope_events handle
      //    the children.
      const draftsDel = await trx
        .deleteFrom('envelopes')
        .where('owner_id', '=', input.owner_id)
        .where('status', '=', 'draft')
        .executeTakeFirst();
      const drafts_deleted = Number(draftsDel?.numDeletedRows ?? 0n);

      // 2. Enumerate the survivors (everything that wasn't a draft).
      const preservedRows = await trx
        .selectFrom('envelopes')
        .select(['id'])
        .where('owner_id', '=', input.owner_id)
        .execute();
      const preservedIds = preservedRows.map((r) => r.id);
      const envelopes_preserved = preservedIds.length;

      let signers_anonymized = 0;
      let retention_events_appended = 0;
      if (preservedIds.length > 0) {
        // 2a. Anonymize signer rows whose email matches the deleted
        //     user's email (case-insensitive). The owner of an envelope
        //     is also frequently a signer on it, so this scrub catches
        //     any self-signed copy. Other signers' rows are untouched
        //     — their consent to participate stands.
        const placeholderEmail = `${input.email_hash}@deleted.invalid`;
        if (input.email !== null && input.email !== undefined) {
          // envelope_signers has no `updated_at` column (audit-grade
          // immutable signer rows); the `created_at` is the only
          // timestamp. Anonymization is intentionally a content-only
          // patch — the row identity stays put.
          const sigUpd = await trx
            .updateTable('envelope_signers')
            .set({
              name: 'Deleted user',
              email: placeholderEmail,
            })
            .where('envelope_id', 'in', preservedIds)
            .where(sql`lower(email)`, '=', input.email.toLowerCase())
            .executeTakeFirst();
          signers_anonymized = Number(sigUpd?.numUpdatedRows ?? 0n);
        }

        // 2b. Append retention_deleted to each preserved envelope's
        //     audit chain. Done inside the same trx so the chain head
        //     read for `prev_event_hash` is consistent. We hash the
        //     latest existing row using the canonical-JSON helper —
        //     same algorithm as appendEvent (S.6).
        for (const envelopeId of preservedIds) {
          const latest = await trx
            .selectFrom('envelope_events')
            .selectAll()
            .where('envelope_id', '=', envelopeId)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst();
          const prevHash = latest ? eventHash(toEventDomain(latest)) : null;
          await trx
            .insertInto('envelope_events')
            .values({
              envelope_id: envelopeId,
              signer_id: null,
              actor_kind: 'system',
              event_type: 'retention_deleted',
              ip: null,
              user_agent: null,
              metadata: JSON.stringify({
                reason: 'account_deletion',
                email_hash: input.email_hash,
              }),
              prev_event_hash: prevHash,
            })
            .executeTakeFirstOrThrow();
          retention_events_appended++;
        }

        // 2c. Detach owner. Migration 0012 relaxed `owner_id` to
        //     nullable + flipped the FK to ON DELETE SET NULL, so this
        //     UPDATE is the application-level equivalent that gives us
        //     the same outcome without depending on Supabase's
        //     `auth.users` row removal happening transactionally.
        await trx
          .updateTable('envelopes')
          .set({ owner_id: null, updated_at: new Date().toISOString() })
          .where('owner_id', '=', input.owner_id)
          .execute();
      }

      return {
        drafts_deleted,
        envelopes_preserved,
        signers_anonymized,
        retention_events_appended,
      };
    });
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
    // Tags are user-private metadata that doesn't affect the signed
    // contents of the envelope, so they're editable at any status.
    // Title / expires_at remain draft-only because they're part of
    // the envelope's signed representation once it ships.
    const { tags, ...draftOnly } = patch;
    const tagsObj = tags !== undefined ? { tags: JSON.stringify(tags) } : {};
    const draftOnlyKeys = Object.keys(draftOnly);
    const updated_at = new Date().toISOString();
    if (draftOnlyKeys.length === 0) {
      // Tags-only update — skip the `status='draft'` guard.
      const res = await this.db
        .updateTable('envelopes')
        .set({ ...tagsObj, updated_at })
        .where('owner_id', '=', owner_id)
        .where('id', '=', envelope_id)
        .executeTakeFirst();
      if ((res?.numUpdatedRows ?? 0n) === 0n) return null;
      return this.findByIdForOwner(owner_id, envelope_id);
    }
    const res = await this.db
      .updateTable('envelopes')
      .set({ ...draftOnly, ...tagsObj, updated_at })
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
        .set({
          status: 'awaiting_others',
          sent_at: now,
          updated_at: now,
          sender_email: input.sender_email,
          sender_name: input.sender_name,
        })
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
    // Branch on capture kind so initials no longer clobber the signature
    // image (or vice versa). When kind is omitted we treat it as
    // 'signature' to preserve the legacy single-column behaviour.
    const isInitials = input.kind === 'initials';
    const patch = isInitials
      ? {
          initials_format: input.signature_format,
          initials_image_path: input.signature_image_path,
        }
      : {
          signature_format: input.signature_format,
          signature_image_path: input.signature_image_path,
          signature_font: input.signature_font ?? null,
          signature_stroke_count: input.signature_stroke_count ?? null,
          signature_source_filename: input.signature_source_filename ?? null,
        };
    const row = await this.db
      .updateTable('envelope_signers')
      .set(patch)
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

  async cancelEnvelope(
    envelope_id: string,
    owner_id: string,
  ): Promise<{
    readonly envelope: Envelope;
    readonly notifiedSignerIds: ReadonlyArray<string>;
    readonly alreadySignedSignerIds: ReadonlyArray<string>;
  } | null> {
    return this.db.transaction().execute(async (trx) => {
      // Lock the envelope row first so a concurrent /decline or /submit
      // can't race the status flip mid-transaction. pg-mem ignores FOR
      // UPDATE but real Postgres respects it; the row-conditional UPDATE
      // below is the actual safety net for either backend.
      const env = await trx
        .selectFrom('envelopes')
        .selectAll()
        .where('id', '=', envelope_id)
        .forUpdate()
        .executeTakeFirst();
      if (!env) return null;
      if (env.owner_id !== owner_id) return null;
      if (env.status !== 'awaiting_others' && env.status !== 'sealing') return null;

      const now = new Date().toISOString();
      const updated = await trx
        .updateTable('envelopes')
        .set({ status: 'canceled', updated_at: now })
        .where('id', '=', envelope_id)
        .where('owner_id', '=', owner_id)
        .where('status', 'in', ['awaiting_others', 'sealing'])
        .executeTakeFirst();
      if ((updated?.numUpdatedRows ?? 0n) === 0n) return null;

      // Revoke pending access tokens. Signers who've already signed or
      // declined keep their token history intact for the audit PDF.
      await trx
        .updateTable('envelope_signers')
        .set({ access_token_hash: null })
        .where('envelope_id', '=', envelope_id)
        .where('signed_at', 'is', null)
        .where('declined_at', 'is', null)
        .execute();

      const signerRows = await trx
        .selectFrom('envelope_signers')
        .select(['id', 'signed_at', 'declined_at'])
        .where('envelope_id', '=', envelope_id)
        .execute();
      const notifiedSignerIds: string[] = [];
      const alreadySignedSignerIds: string[] = [];
      for (const s of signerRows) {
        if (s.signed_at !== null) {
          alreadySignedSignerIds.push(s.id);
        } else if (s.declined_at === null) {
          // Pending (not signed, not declined) — they need the
          // "withdrawn_to_signer" notification.
          notifiedSignerIds.push(s.id);
        }
        // Already-declined signers get nothing — the decline flow already
        // notified them via session_invalidated_by_decline.
      }

      const envelope = await this.findByIdWithAllTrx(trx, envelope_id);
      if (!envelope) return null;
      return { envelope, notifiedSignerIds, alreadySignedSignerIds };
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
    // Tamper-evident chain: each row stores SHA-256 of the previous row's
    // canonical JSON (within the same envelope, ordered by created_at).
    //
    // Concurrency: two concurrent appends on the same envelope could
    // observe the same "latest" predecessor and both write the same
    // prev_event_hash, silently breaking the chain. Migration 0007
    // installs a partial unique index on (envelope_id, prev_event_hash)
    // WHERE prev_event_hash IS NOT NULL — the second writer's INSERT
    // hits 23505 and we retry once, picking up the freshly-written row
    // as the new predecessor. The retry is bounded so a runaway loop
    // (e.g. unique-index disabled in tests) still terminates.
    const MAX_RETRIES = 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await this.db.transaction().execute(async (trx) => {
          const latest = await trx
            .selectFrom('envelope_events')
            .selectAll()
            .where('envelope_id', '=', input.envelope_id)
            .orderBy('created_at', 'desc')
            .orderBy('id', 'desc')
            .limit(1)
            .executeTakeFirst();
          const prevHash = latest ? eventHash(toEventDomain(latest)) : null;
          const row = await trx
            .insertInto('envelope_events')
            .values({
              envelope_id: input.envelope_id,
              signer_id: input.signer_id ?? null,
              actor_kind: input.actor_kind,
              event_type: input.event_type,
              ip: input.ip ?? null,
              user_agent: input.user_agent ?? null,
              metadata: JSON.stringify(input.metadata ?? {}),
              prev_event_hash: prevHash,
            })
            .returningAll()
            .executeTakeFirstOrThrow();
          return toEventDomain(row);
        });
      } catch (err) {
        lastErr = err;
        if (!isPrevHashUniqueViolation(err)) throw err;
        // Race detected — retry with the freshly-written predecessor.
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error('appendEvent_chain_race');
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

  async claimNextJob(): Promise<ClaimedJob | null> {
    // SKIP LOCKED so a second worker racing this SELECT jumps past the row
    // the first worker is about to claim. The raw CTE is the cleanest way
    // to express this in Kysely without a roundtrip.
    const result = await sql<{
      id: string;
      envelope_id: string;
      kind: 'seal' | 'audit_only';
      attempts: number;
      max_attempts: number;
    }>`
      with next_job as (
        select id from envelope_jobs
        where status in ('pending', 'failed')
          and scheduled_for <= now()
          and attempts < max_attempts
        order by scheduled_for asc
        limit 1
        for update skip locked
      )
      update envelope_jobs j
      set status = 'running',
          attempts = j.attempts + 1,
          started_at = now(),
          last_error = null
      from next_job
      where j.id = next_job.id
      returning j.id, j.envelope_id, j.kind, j.attempts, j.max_attempts
    `.execute(this.db);
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      envelope_id: row.envelope_id,
      kind: row.kind,
      attempts: row.attempts,
      max_attempts: row.max_attempts,
    };
  }

  async finishJob(job_id: string): Promise<void> {
    await this.db
      .updateTable('envelope_jobs')
      .set({ status: 'done', finished_at: new Date().toISOString() })
      .where('id', '=', job_id)
      .execute();
  }

  async failJob(job_id: string, error: string): Promise<void> {
    // If attempts < max_attempts, reset to pending with exponential backoff
    // (2^attempts minutes, capped). Otherwise terminal failed.
    const current = await this.db
      .selectFrom('envelope_jobs')
      .select(['attempts', 'max_attempts'])
      .where('id', '=', job_id)
      .executeTakeFirst();
    if (!current) return;
    const trimmed = error.length > 2000 ? error.slice(0, 2000) : error;
    if (current.attempts >= current.max_attempts) {
      await this.db
        .updateTable('envelope_jobs')
        .set({
          status: 'failed',
          last_error: trimmed,
          finished_at: new Date().toISOString(),
        })
        .where('id', '=', job_id)
        .execute();
      return;
    }
    const delayMs = Math.min(Math.pow(2, current.attempts) * 60_000, 10 * 60_000);
    const scheduledFor = new Date(Date.now() + delayMs).toISOString();
    await this.db
      .updateTable('envelope_jobs')
      .set({
        status: 'pending',
        last_error: trimmed,
        scheduled_for: scheduledFor,
      })
      .where('id', '=', job_id)
      .execute();
  }

  async transitionToSealed(
    envelope_id: string,
    input: { sealed_file_path: string; sealed_sha256: string; audit_file_path: string },
  ): Promise<Envelope | null> {
    return this.db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable('envelopes')
        .set({
          status: 'completed',
          sealed_file_path: input.sealed_file_path,
          sealed_sha256: input.sealed_sha256,
          audit_file_path: input.audit_file_path,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .where('id', '=', envelope_id)
        .where('status', '=', 'sealing')
        .returning(['id'])
        .executeTakeFirst();
      if (!updated) return null;
      return this.findByIdWithAllTrx(trx, envelope_id);
    });
  }

  async setAuditFile(envelope_id: string, audit_file_path: string): Promise<Envelope | null> {
    const updated = await this.db
      .updateTable('envelopes')
      .set({ audit_file_path, updated_at: new Date().toISOString() })
      .where('id', '=', envelope_id)
      .returning(['id'])
      .executeTakeFirst();
    if (!updated) return null;
    return this.findByIdWithAll(envelope_id);
  }

  async getFilePaths(envelope_id: string): Promise<{
    readonly original_file_path: string | null;
    readonly sealed_file_path: string | null;
    readonly audit_file_path: string | null;
  } | null> {
    const row = await this.db
      .selectFrom('envelopes')
      .select(['original_file_path', 'sealed_file_path', 'audit_file_path'])
      .where('id', '=', envelope_id)
      .executeTakeFirst();
    if (!row) return null;
    return {
      original_file_path: row.original_file_path,
      sealed_file_path: row.sealed_file_path,
      audit_file_path: row.audit_file_path,
    };
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
