import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { ENVELOPE_STATUSES, isFeatureEnabled } from 'shared';
import type { Envelope as WireEnvelope, EnvelopeGdriveSaveResult, GdriveExportState } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import {
  GDRIVE_ENVELOPE_EXPORTS_REPOSITORY,
  type GdriveEnvelopeExportsRepository,
} from '../integrations/gdrive/gdrive-envelope-exports.repository';
import { GdriveExportService } from '../integrations/gdrive/gdrive-export.service';
import { GDriveService } from '../integrations/gdrive/gdrive.service';
import { ContactsRepository } from '../contacts/contacts.repository';
import {
  DuplicateOutboundEmailError,
  OutboundEmailsRepository,
} from '../email/outbound-emails.repository';
import {
  buildSignerListHtmlFromSigners,
  buildTimelineHtml,
  type TimelineEventFragment,
} from '../email/template-fragments';
import { SigningTokenService } from '../signing/signing-token.service';
import { StorageService } from '../storage/storage.service';
import type {
  CreateFieldInput,
  DateWindow,
  EnvelopeBucket,
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
  EnvelopeSortKey,
  ListCursor,
  ListResult,
  SetOriginalFileInput,
  SortDir,
  UpdateDraftMetadataPatch,
} from './envelopes.repository';
import {
  ENVELOPE_BUCKETS,
  ENVELOPE_SORT_KEYS,
  EnvelopeSignerEmailTakenError,
  EnvelopesRepository,
  InvalidCursorError,
  ShortCodeCollisionError,
} from './envelopes.repository';
import { generateShortCode } from './short-code';

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB per spec §3.1
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

type Envelope = WireEnvelope;
type EnvelopeStatus = Envelope['status'];

const DEFAULT_EXPIRY_DAYS = 30;
const MAX_SHORT_CODE_RETRIES = 5;

/**
 * Sender-side orchestration for envelope drafts: create, read, list, patch,
 * delete, upload-commit, signer management, field replacement, duplicate,
 * and audit-event stream. Owner isolation, state-machine guards, and
 * domain-error → HTTP-exception mapping all live here.
 *
 * The `/sign/*` and worker code paths use the repository directly with
 * their own services. This service is exclusively for the authenticated
 * sender surface.
 */
@Injectable()
export class EnvelopesService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly contactsRepo: ContactsRepository,
    private readonly storage: StorageService,
    private readonly outboundEmails: OutboundEmailsRepository,
    private readonly tokens: SigningTokenService,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly gdriveAccounts: GDriveService,
    private readonly gdriveExport: GdriveExportService,
    @Inject(GDRIVE_ENVELOPE_EXPORTS_REPOSITORY)
    private readonly gdriveExportsRepo: GdriveEnvelopeExportsRepository,
  ) {}

  async createDraft(
    owner_id: string,
    dto: { title: string },
    audit: { ip: string | null; user_agent: string | null } = { ip: null, user_agent: null },
  ): Promise<Envelope> {
    const expires_at = new Date(
      Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const envelope = await this.createDraftWithRetry({
      owner_id,
      title: dto.title,
      tc_version: this.env.TC_VERSION,
      privacy_version: this.env.PRIVACY_VERSION,
      expires_at,
    });
    await this.repo.appendEvent({
      envelope_id: envelope.id,
      actor_kind: 'sender',
      event_type: 'created',
      ip: audit.ip,
      user_agent: audit.user_agent,
      metadata: {},
    });
    return envelope;
  }

  private async createDraftWithRetry(
    input: Omit<Parameters<EnvelopesRepository['createDraft']>[0], 'short_code'>,
  ): Promise<Envelope> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SHORT_CODE_RETRIES; attempt++) {
      try {
        return await this.repo.createDraft({ ...input, short_code: generateShortCode() });
      } catch (err) {
        if (err instanceof ShortCodeCollisionError) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('short_code_collision');
  }

  async getById(owner_id: string, id: string): Promise<Envelope> {
    const envelope = await this.repo.findByIdForOwner(owner_id, id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    const gdriveExport = await this.buildGdriveExportState(owner_id, id);
    return { ...envelope, gdriveExport };
  }

  /**
   * Assemble the `gdriveExport` block for the envelope-detail payload.
   * `null` when the `gdriveIntegration` flag is off — the SPA renders
   * nothing Drive-related in that case. Otherwise: `connected` is
   * whether the user has any (non-soft-deleted) Drive account; the
   * `lastFolder` / `lastPushedAt` fields come from this envelope's own
   * `gdrive_envelope_exports` row, if any.
   */
  private async buildGdriveExportState(
    owner_id: string,
    envelope_id: string,
  ): Promise<GdriveExportState | null> {
    if (!isFeatureEnabled('gdriveIntegration')) return null;
    const accounts = await this.gdriveAccounts.listAccounts(owner_id);
    const connected = accounts.some((a) => !a.deletedAt);
    const record = await this.gdriveExportsRepo.findLatestByEnvelope(envelope_id);
    const lastFolder =
      record && record.folderId
        ? { id: record.folderId, name: record.folderName ?? record.folderId }
        : null;
    return {
      connected,
      lastFolder,
      lastPushedAt: record ? record.lastPushedAt : null,
    };
  }

  async list(
    owner_id: string,
    opts: {
      statuses?: readonly EnvelopeStatus[];
      limit?: number;
      cursor?: string;
      sort?: string;
      dir?: string;
      // Dashboard filters (raw query-param strings; parsed here).
      q?: string;
      bucket?: string; // comma-separated EnvelopeBucket values
      date?: string; // preset keyword or `custom:YYYY-MM-DD:YYYY-MM-DD`
      signer?: string; // comma-separated emails
      tags?: string; // comma-separated tag names
      viewerEmail?: string | null;
    },
  ): Promise<ListResult> {
    const clampedLimit = Math.max(1, Math.min(100, opts.limit ?? 20));

    if (opts.statuses) {
      for (const s of opts.statuses) {
        if (!(ENVELOPE_STATUSES as readonly string[]).includes(s)) {
          throw new BadRequestException('validation_error');
        }
      }
    }

    let sort: EnvelopeSortKey | undefined;
    if (opts.sort !== undefined) {
      if (!(ENVELOPE_SORT_KEYS as readonly string[]).includes(opts.sort)) {
        throw new BadRequestException('validation_error');
      }
      sort = opts.sort as EnvelopeSortKey;
    }
    let dir: SortDir | undefined;
    if (opts.dir !== undefined) {
      if (opts.dir !== 'asc' && opts.dir !== 'desc') {
        throw new BadRequestException('validation_error');
      }
      dir = opts.dir;
    }

    // ---- Dashboard filters ----
    const q = opts.q && opts.q.trim() !== '' ? opts.q.trim() : undefined;

    let buckets: ReadonlyArray<EnvelopeBucket> | undefined;
    if (opts.bucket !== undefined && opts.bucket !== '') {
      const parsed = opts.bucket.split(',').map((b) => b.trim());
      for (const b of parsed) {
        if (!(ENVELOPE_BUCKETS as readonly string[]).includes(b)) {
          throw new BadRequestException('validation_error');
        }
      }
      if (parsed.length > 0) buckets = parsed as EnvelopeBucket[];
    }

    let date: DateWindow | undefined;
    if (opts.date !== undefined && opts.date !== '' && opts.date !== 'all') {
      date = this.resolveDateWindow(opts.date);
    }

    const signerEmails =
      opts.signer !== undefined && opts.signer !== ''
        ? opts.signer
            .split(',')
            .map((s) => s.trim().toLowerCase())
            .filter((s) => s.length > 0)
        : undefined;

    const tags =
      opts.tags !== undefined && opts.tags !== ''
        ? opts.tags
            .split(',')
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0)
        : undefined;

    let cursor: ListCursor | null = null;
    if (opts.cursor) {
      try {
        cursor = this.repo.decodeCursorOrThrow(opts.cursor);
      } catch (err) {
        if (err instanceof InvalidCursorError) throw new BadRequestException('invalid_cursor');
        throw err;
      }
    }

    return this.repo.listByOwner(owner_id, {
      ...(opts.statuses ? { statuses: opts.statuses } : {}),
      limit: clampedLimit,
      ...(sort !== undefined ? { sort } : {}),
      ...(dir !== undefined ? { dir } : {}),
      ...(q !== undefined ? { q } : {}),
      ...(buckets !== undefined && buckets.length > 0 ? { buckets } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(signerEmails !== undefined && signerEmails.length > 0 ? { signerEmails } : {}),
      ...(tags !== undefined && tags.length > 0 ? { tags } : {}),
      ...(opts.viewerEmail !== undefined ? { viewerEmail: opts.viewerEmail } : {}),
      cursor,
    });
  }

  /**
   * Resolve a `date` query-param into a `[from, to)` instant window.
   * Presets are anchored to UTC-midnight "now" (server clock is
   * authoritative). `custom:YYYY-MM-DD:YYYY-MM-DD` is treated as a
   * pair of UTC calendar days, inclusive on both ends. Bad input →
   * 400 `validation_error`.
   */
  private resolveDateWindow(raw: string): DateWindow {
    const utcStartOfDay = (d: Date): Date =>
      new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    if (raw.startsWith('custom:')) {
      const [, from, to] = raw.split(':');
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (!from || !to || !dateRe.test(from) || !dateRe.test(to) || from > to) {
        throw new BadRequestException('validation_error');
      }
      const toExclusive = new Date(`${to}T00:00:00Z`);
      toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
      return { from: new Date(`${from}T00:00:00Z`).toISOString(), to: toExclusive.toISOString() };
    }
    const now = new Date();
    const today = utcStartOfDay(now);
    const plusDays = (d: Date, n: number): Date => {
      const out = new Date(d);
      out.setUTCDate(out.getUTCDate() + n);
      return out;
    };
    if (raw === 'today') {
      return { from: today.toISOString(), to: plusDays(today, 1).toISOString() };
    }
    if (raw === '7d') {
      return { from: plusDays(today, -6).toISOString(), to: plusDays(today, 1).toISOString() };
    }
    if (raw === '30d') {
      return { from: plusDays(today, -29).toISOString(), to: plusDays(today, 1).toISOString() };
    }
    if (raw === 'thisMonth') {
      const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1));
      return { from: from.toISOString(), to: to.toISOString() };
    }
    throw new BadRequestException('validation_error');
  }

  async patchDraft(
    owner_id: string,
    id: string,
    patch: UpdateDraftMetadataPatch,
  ): Promise<Envelope> {
    // class-transformer's @IsOptional() decorator leaves declared fields on the
    // DTO instance as `undefined` when the request body omits them. Spreading
    // those into the DB patch would clobber existing columns with null. Strip
    // undefineds before passing to the repo (same defence as contacts.service).
    const sanitized = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as UpdateDraftMetadataPatch;
    if (Object.keys(sanitized).length === 0) {
      throw new BadRequestException('validation_error');
    }
    // Tags are normalized here (the API trusts user input as raw
    // strings — lower-case, trim, drop empties, dedupe) before
    // persistence. The 10-tag / 32-char caps are enforced by the
    // DTO. Tags are editable on any envelope status; title /
    // expires_at remain draft-only (the repo enforces this split).
    if (sanitized.tags !== undefined) {
      const seen = new Set<string>();
      const normalized: string[] = [];
      for (const raw of sanitized.tags) {
        const t = raw.trim().toLowerCase();
        if (t.length === 0) continue;
        if (seen.has(t)) continue;
        seen.add(t);
        normalized.push(t);
      }
      // The repo accepts ReadonlyArray<string> on the patch; we
      // build the new array here so the assignment lands on a
      // fresh object rather than mutating `sanitized` (which is
      // typed as readonly).
      (sanitized as { tags: ReadonlyArray<string> }).tags = normalized;
    }
    const updated = await this.repo.updateDraftMetadata(owner_id, id, sanitized);
    if (updated) return updated;
    const existing = await this.repo.findByIdForOwner(owner_id, id);
    if (!existing) throw new NotFoundException('envelope_not_found');
    throw new ConflictException('envelope_not_draft');
  }

  /**
   * Issues a short-lived signed URL so the sender can download the PDF.
   *
   * `kind`:
   *   - `undefined` (default) — sealed if available, else original.
   *   - `'sealed'`   — the sealed artifact. 404 if the envelope isn't complete.
   *   - `'original'` — the uploaded PDF.
   *   - `'audit'`    — the audit-trail PDF produced by the sealing job.
   *
   * Throws `file_not_ready` when the requested artifact isn't on the
   * envelope yet (e.g. asking for the audit PDF before sealing ran).
   */
  async getDownloadUrl(
    owner_id: string,
    id: string,
    kind?: 'sealed' | 'original' | 'audit',
  ): Promise<{ readonly url: string; readonly kind: 'sealed' | 'original' | 'audit' }> {
    const envelope = await this.repo.findByIdForOwner(owner_id, id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    const paths = await this.repo.getFilePaths(id);
    if (!paths) throw new NotFoundException('envelope_not_found');

    let resolvedKind: 'sealed' | 'original' | 'audit';
    let path: string | null;
    if (kind === 'audit') {
      resolvedKind = 'audit';
      path = paths.audit_file_path;
    } else if (kind === 'original') {
      resolvedKind = 'original';
      path = paths.original_file_path;
    } else if (kind === 'sealed') {
      resolvedKind = 'sealed';
      path = paths.sealed_file_path;
    } else {
      resolvedKind = paths.sealed_file_path !== null ? 'sealed' : 'original';
      path = resolvedKind === 'sealed' ? paths.sealed_file_path : paths.original_file_path;
    }

    if (path === null) throw new BadRequestException('file_not_ready');
    // 5-minute TTL — enough for the browser to start a download even on
    // a slow link, short enough that a copied URL won't linger.
    const url = await this.storage.createSignedUrl(path, 300);
    return { url, kind: resolvedKind };
  }

  /**
   * Push the envelope's sealed PDF + audit-trail PDF into a Google Drive
   * folder the user picked. Preconditions:
   *   - envelope exists and is owned by the user (404 `envelope_not_found`)
   *   - the sealed + audit artifacts both exist (409 `envelope_not_sealed`)
   *
   * The actual Drive work — picking the account, minting a token,
   * uploading/updating each artifact, persisting the export record — is
   * delegated to {@link GdriveExportService}. Drive-side / account-side
   * errors (`GdriveNotConnectedError`, `TokenExpiredError`,
   * `RateLimitedError`, `DrivePermissionDeniedError`, `DriveUpstreamError`)
   * bubble up; the controller maps them to HTTP.
   */
  async saveToGoogleDrive(
    owner_id: string,
    id: string,
    args: { readonly folderId: string; readonly folderName: string | null },
  ): Promise<EnvelopeGdriveSaveResult> {
    const envelope = await this.repo.findByIdForOwner(owner_id, id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    const paths = await this.repo.getFilePaths(id);
    if (!paths) throw new NotFoundException('envelope_not_found');
    if (paths.sealed_file_path === null || paths.audit_file_path === null) {
      throw new ConflictException('envelope_not_sealed');
    }

    const baseName = sanitizeFileBase(envelope.title);
    const result = await this.gdriveExport.exportEnvelope({
      userId: owner_id,
      envelopeId: id,
      folderId: args.folderId,
      folderName: args.folderName,
      artifacts: [
        { kind: 'sealed', path: paths.sealed_file_path, name: `${baseName} (sealed).pdf` },
        { kind: 'audit', path: paths.audit_file_path, name: `${baseName} (audit trail).pdf` },
      ],
    });
    return {
      folder: { ...result.folder },
      files: result.files.map((f) => ({ ...f })),
      ...(result.partialError !== undefined
        ? { error: { kind: result.partialError.kind, code: result.partialError.code } }
        : {}),
      pushedAt: new Date().toISOString(),
    };
  }

  async deleteDraft(owner_id: string, id: string): Promise<void> {
    const deleted = await this.repo.deleteDraft(owner_id, id);
    if (deleted) return;
    const existing = await this.repo.findByIdForOwner(owner_id, id);
    if (!existing) throw new NotFoundException('envelope_not_found');
    throw new ConflictException('envelope_not_draft');
  }

  async setOriginalFile(
    owner_id: string,
    id: string,
    input: SetOriginalFileInput,
  ): Promise<Envelope> {
    const envelope = await this.repo.findByIdForOwner(owner_id, id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
    const updated = await this.repo.setOriginalFile(id, input);
    if (!updated) throw new ConflictException('envelope_not_draft');
    await this.repo.appendEvent({
      envelope_id: id,
      actor_kind: 'sender',
      event_type: 'created',
      metadata: { bytes_hash: input.sha256, pages: input.pages },
    });
    return updated;
  }

  /**
   * Full upload pipeline: validate magic bytes, size, and PDF parsability;
   * compute SHA-256; upload to Storage at `{envelope_id}/original.pdf`;
   * record in DB via setOriginalFile.
   *
   * Called by the controller after Multer has buffered the multipart body.
   * Validations are duplicated here (the controller also enforces) because the
   * service is the authority — keeps the data layer correct even if a future
   * caller bypasses the controller.
   */
  async uploadOriginal(owner_id: string, id: string, body: Buffer): Promise<Envelope> {
    // Gate ownership + draft status BEFORE touching storage.
    const envelope = await this.repo.findByIdForOwner(owner_id, id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    if (body.length > MAX_PDF_BYTES) throw new PayloadTooLargeException('file_too_large');
    if (body.length < PDF_MAGIC.length || !body.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
      throw new UnsupportedMediaTypeException('file_not_pdf');
    }

    let pages: number;
    try {
      const doc = await PDFDocument.load(body, {
        updateMetadata: false,
        ignoreEncryption: false,
        throwOnInvalidObject: true,
      });
      pages = doc.getPageCount();
    } catch {
      throw new BadRequestException('file_unreadable');
    }
    if (pages <= 0) throw new BadRequestException('file_unreadable');

    const sha256 = createHash('sha256').update(body).digest('hex');
    const file_path = `${envelope.id}/original.pdf`;
    await this.storage.upload(file_path, body, 'application/pdf');

    return this.setOriginalFile(owner_id, id, { file_path, sha256, pages });
  }

  /**
   * Add a signer to a draft envelope. Two payload shapes are supported:
   *
   *   1. Contact-backed: `{ contact_id }` — the sender selected a saved
   *      contact in the editor's "Pick from contacts" dropdown.
   *   2. Ad-hoc:        `{ email, name, color? }` — guest-mode senders
   *      synthesize signers locally (UploadRoute.synthLocalSigner) without
   *      ever persisting a contact row. This branch keeps `contact_id` null
   *      on the row; the repo already supports that (AddSignerInput.contact_id
   *      is optional).
   *
   * The DTO layer (`AddSignerDto`) ensures exactly one of the two shapes is
   * present at the controller boundary; this service trusts that and routes
   * accordingly.
   */
  async addSigner(
    owner_id: string,
    envelope_id: string,
    dto: { contact_id?: string; email?: string; name?: string; color?: string },
  ): Promise<EnvelopeSigner> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    let signerInput: {
      contact_id: string | null;
      email: string;
      name: string;
      color: string;
      role: 'signatory';
    };

    if (dto.contact_id) {
      const contact = await this.contactsRepo.findOneByOwner(owner_id, dto.contact_id);
      if (!contact) throw new NotFoundException('contact_not_found');
      signerInput = {
        contact_id: contact.id,
        email: contact.email,
        name: contact.name,
        color: contact.color,
        role: 'signatory',
      };
    } else {
      // Ad-hoc shape — DTO already validated email + name are present and well
      // formed. Default colour matches the SPA's fallback (UploadRoute uses
      // the next free swatch from `nextColor`; if none was sent we use a
      // neutral indigo so the signer surface still has a chip colour).
      if (!dto.email || !dto.name) throw new BadRequestException('signer_payload_invalid');
      signerInput = {
        contact_id: null,
        email: dto.email,
        name: dto.name,
        color: dto.color ?? '#818CF8',
        role: 'signatory',
      };
    }

    try {
      return await this.repo.addSigner(envelope_id, signerInput);
    } catch (err) {
      if (err instanceof EnvelopeSignerEmailTakenError) {
        throw new ConflictException('signer_email_taken');
      }
      throw err;
    }
  }

  async removeSigner(owner_id: string, envelope_id: string, signer_id: string): Promise<void> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    const removed = await this.repo.removeSigner(envelope_id, signer_id);
    if (!removed) throw new NotFoundException('envelope_not_found');
  }

  async replaceFields(
    owner_id: string,
    envelope_id: string,
    fields: readonly CreateFieldInput[],
  ): Promise<readonly EnvelopeField[]> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    const envelopeSignerIds = new Set(envelope.signers.map((s) => s.id));
    for (const f of fields) {
      if (!envelopeSignerIds.has(f.signer_id)) {
        throw new BadRequestException('signer_not_in_envelope');
      }
    }

    return this.repo.replaceFields(envelope_id, fields);
  }

  async listEvents(owner_id: string, envelope_id: string): Promise<readonly EnvelopeEvent[]> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    return this.repo.listEventsForEnvelope(envelope_id);
  }

  /**
   * Transition an envelope from `draft` to `awaiting_others`, generate +
   * hash per-signer tokens, write `sent` events, and enqueue `invite` emails.
   *
   * The four writes are sequenced (not one DB transaction). The
   * `repo.sendDraft` call is atomic and row-conditional, so the status flip
   * is safe. If the subsequent event-append or email-enqueue fails, the
   * envelope is in `awaiting_others` but missing some audit/email rows — the
   * sender can fix by hitting the `remind` endpoint (Task 15) which writes
   * a fresh reminder email.
   *
   * Idempotent: re-calling `send` on an already-sent envelope short-circuits
   * at the first `repo.sendDraft` call (returns null because status isn't
   * `draft`), and returns the current envelope unchanged.
   */
  async send(
    owner_id: string,
    envelope_id: string,
    sender: { readonly email: string; readonly name?: string | null },
    audit: { ip: string | null; user_agent: string | null } = { ip: null, user_agent: null },
  ): Promise<Envelope> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    // Invariants — fail before we generate tokens.
    if (!envelope.original_sha256 || !envelope.original_pages) {
      throw new BadRequestException('file_required');
    }
    if (envelope.signers.length === 0) {
      throw new BadRequestException('no_signers');
    }
    if (envelope.fields.length === 0) {
      throw new BadRequestException('no_fields');
    }
    const signersWithSigField = new Set<string>();
    for (const f of envelope.fields) {
      if ((f.kind === 'signature' || f.kind === 'initials') && f.required) {
        signersWithSigField.add(f.signer_id);
      }
    }
    for (const s of envelope.signers) {
      if (!signersWithSigField.has(s.id)) {
        throw new BadRequestException('signer_without_signature_field');
      }
    }

    // Generate one plaintext token per signer + its hash. Plaintext is held
    // in memory for the email enqueue step; only the hash persists in DB.
    const signerTokens = envelope.signers.map((s) => {
      const token = this.tokens.generate();
      return {
        signer_id: s.id,
        signer_email: s.email,
        signer_name: s.name,
        plaintext_token: token,
        access_token_hash: this.tokens.hash(token),
      };
    });

    // Atomic status flip + per-signer hash stamping. Sender identity is
    // persisted here so the decline/withdrawal flow can email the sender
    // without a privileged auth.users lookup.
    const sent = await this.repo.sendDraft({
      envelope_id,
      signer_tokens: signerTokens.map((t) => ({
        signer_id: t.signer_id,
        access_token_hash: t.access_token_hash,
      })),
      sender_email: sender.email,
      sender_name: sender.name ?? null,
    });
    if (!sent) {
      // Lost the race — another concurrent call transitioned status.
      throw new ConflictException('envelope_not_draft');
    }

    // Audit events + outbound emails. Best-effort — per-signer independent.
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    for (const t of signerTokens) {
      // Append the `sent` event first so its id can be the source_event_id.
      const event = await this.repo.appendEvent({
        envelope_id,
        signer_id: t.signer_id,
        actor_kind: 'system',
        event_type: 'sent',
        ip: audit.ip,
        user_agent: audit.user_agent,
        metadata: {},
      });

      const signUrl = `${publicUrl}/sign/${envelope_id}?t=${t.plaintext_token}`;
      // Canonical verify route is `/verify/<short_code>` — matches the SPA + audit-pdf QR.
      const verifyUrl = `${publicUrl}/verify/${envelope.short_code}`;
      try {
        await this.outboundEmails.insert({
          envelope_id,
          signer_id: t.signer_id,
          kind: 'invite',
          to_email: t.signer_email,
          to_name: t.signer_name,
          source_event_id: event.id,
          payload: {
            sender_name: sender.name ?? sender.email,
            sender_email: sender.email,
            envelope_title: envelope.title,
            sign_url: signUrl,
            verify_url: verifyUrl,
            short_code: envelope.short_code,
            public_url: publicUrl,
          },
        });
      } catch (err) {
        if (err instanceof DuplicateOutboundEmailError) {
          // Idempotent — the row already existed for this (envelope, signer,
          // invite, source_event_id). Treat as success.
          continue;
        }
        throw err;
      }
    }

    return sent;
  }

  /**
   * Sender-initiated cancel ("withdraw") of a sent envelope. Mirrors
   * SigningService.decline on the sender side: atomically flip the
   * envelope to `canceled`, revoke pending access tokens, fan out the
   * pre-staged `withdrawn_to_signer` / `withdrawn_after_sign` emails,
   * and enqueue an `audit_only` job so the timeline + audit PDF reflect
   * the terminal state.
   *
   * Allowed transitions: `awaiting_others` | `sealing` → `canceled`.
   * `draft` keeps the existing `deleteDraft` flow (no email side-effects)
   * and any terminal status (`completed` / `declined` / `expired` /
   * `canceled`) is rejected with 409.
   */
  async cancel(
    owner_id: string,
    envelope_id: string,
    audit: { ip: string | null; user_agent: string | null } = { ip: null, user_agent: null },
  ): Promise<{ readonly status: 'canceled'; readonly envelope_status: 'canceled' }> {
    const result = await this.repo.cancelEnvelope(envelope_id, owner_id);
    if (!result) {
      // Disambiguate: not the owner's row → 404; otherwise terminal → 409.
      const fresh = await this.repo.findByIdForOwner(owner_id, envelope_id);
      if (!fresh) throw new NotFoundException('envelope_not_found');
      throw new ConflictException('envelope_terminal');
    }

    const { envelope, notifiedSignerIds, alreadySignedSignerIds } = result;
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const verifyUrl = `${publicUrl}/verify/${envelope.short_code}`;
    const senderDisplay = envelope.sender_name ?? envelope.sender_email ?? 'The document sender';

    // Sender's own audit event for the cancel action.
    const canceledEvent = await this.repo.appendEvent({
      envelope_id,
      actor_kind: 'sender',
      event_type: 'canceled',
      ip: audit.ip,
      user_agent: audit.user_agent,
      metadata: {
        notified_signer_count: notifiedSignerIds.length,
        already_signed_signer_count: alreadySignedSignerIds.length,
      },
    });

    // Pre-render a single timeline for the `withdrawn_after_sign` kind:
    // (sent → each who signed → withdrawn pending). One render even if
    // multiple recipients share it.
    const withdrawnTimelineHtml = ((): string => {
      const events: TimelineEventFragment[] = [];
      if (envelope.sent_at !== null) {
        events.push({
          label: `Envelope sent by ${senderDisplay}`,
          at: formatUtc(envelope.sent_at),
        });
      }
      for (const s of envelope.signers) {
        if (s.signed_at !== null) {
          events.push({ label: `${s.name} signed`, at: formatUtc(s.signed_at) });
        }
      }
      events.push({
        label: `Envelope withdrawn by ${senderDisplay}`,
        at: formatUtc(new Date().toISOString()),
        pending: true,
      });
      return buildTimelineHtml(events);
    })();

    // Pending signers — withdrawn_to_signer + session_invalidated_by_cancel.
    for (const signerId of notifiedSignerIds) {
      const signer = envelope.signers.find((s) => s.id === signerId);
      if (!signer) continue;

      await this.repo.appendEvent({
        envelope_id,
        signer_id: signerId,
        actor_kind: 'system',
        event_type: 'session_invalidated_by_cancel',
        metadata: {},
      });

      try {
        await this.outboundEmails.insert({
          envelope_id,
          signer_id: signerId,
          kind: 'withdrawn_to_signer',
          to_email: signer.email,
          to_name: signer.name,
          source_event_id: canceledEvent.id,
          payload: {
            sender_name: senderDisplay,
            envelope_title: envelope.title,
            short_code: envelope.short_code,
            verify_url: verifyUrl,
            public_url: publicUrl,
          },
        });
      } catch (err) {
        if (err instanceof DuplicateOutboundEmailError) continue;
        throw err;
      }
    }

    // Signers who'd already completed before cancel — withdrawn_after_sign.
    // They keep their copy + the audit retains their submission as legal
    // evidence; no session-invalidation event because their session was
    // already terminal (`signed_at` was set).
    for (const signerId of alreadySignedSignerIds) {
      const signer = envelope.signers.find((s) => s.id === signerId);
      if (!signer || signer.signed_at === null) continue;
      try {
        await this.outboundEmails.insert({
          envelope_id,
          signer_id: signerId,
          kind: 'withdrawn_after_sign',
          to_email: signer.email,
          to_name: signer.name,
          source_event_id: canceledEvent.id,
          payload: {
            sender_name: senderDisplay,
            envelope_title: envelope.title,
            signed_at_readable: formatUtc(signer.signed_at),
            short_code: envelope.short_code,
            verify_url: verifyUrl,
            public_url: publicUrl,
            timeline_html: withdrawnTimelineHtml,
          },
        });
      } catch (err) {
        if (err instanceof DuplicateOutboundEmailError) continue;
        throw err;
      }
    }

    // Audit-only seal job — produces the audit PDF for the canceled
    // envelope. Mirrors the decline path so the artifact set is consistent
    // across terminal statuses.
    await this.repo.enqueueJob(envelope_id, 'audit_only');

    return { status: 'canceled', envelope_status: 'canceled' };
  }

  /**
   * Manually re-send the signing invite to a single signer. Rotates the
   * signer's access_token_hash so the new email carries a fresh token —
   * any prior link is dead the moment this succeeds. Throttled to at most
   * 1 reminder per signer per hour via the outbound_emails audit trail.
   *
   * Sender identity (name/email) is pulled from the JWT and threaded into
   * the reminder template, same shape as the original invite. Controller
   * returns 202 Accepted (asynchronous in nature — email delivery is the
   * worker's job).
   */
  async remindSigner(
    owner_id: string,
    envelope_id: string,
    signer_id: string,
    sender: { readonly email: string; readonly name?: string | null },
  ): Promise<void> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'awaiting_others') {
      throw new ConflictException('envelope_terminal');
    }

    const signer = envelope.signers.find((s) => s.id === signer_id);
    if (!signer) throw new NotFoundException('envelope_not_found');
    if (signer.signed_at !== null) throw new ConflictException('already_signed');
    if (signer.declined_at !== null) throw new ConflictException('already_declined');

    // Throttle: 1 invite/reminder per hour per (envelope, signer).
    const recent = await this.outboundEmails.findLastInviteOrReminder(envelope_id, signer_id);
    if (recent) {
      const ageMs = Date.now() - new Date(recent.created_at).getTime();
      if (ageMs < 60 * 60 * 1000) {
        throw new HttpException('remind_throttled', HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    // Rotate the token atomically. If rotation fails (e.g., a concurrent
    // sign/decline landed), map to the right 4xx.
    const token = this.tokens.generate();
    const rotated = await this.repo.rotateSignerAccessToken(signer_id, this.tokens.hash(token));
    if (!rotated) {
      // Re-read to differentiate what race we lost.
      const fresh = await this.repo.findByIdForOwner(owner_id, envelope_id);
      const freshSigner = fresh?.signers.find((s) => s.id === signer_id);
      if (!fresh || fresh.status !== 'awaiting_others') {
        throw new ConflictException('envelope_terminal');
      }
      if (freshSigner?.signed_at) throw new ConflictException('already_signed');
      if (freshSigner?.declined_at) throw new ConflictException('already_declined');
      throw new ConflictException('envelope_terminal');
    }

    // Audit event first so its id anchors the outbound_emails row.
    const event = await this.repo.appendEvent({
      envelope_id,
      signer_id,
      actor_kind: 'sender',
      event_type: 'reminder_sent',
      metadata: {},
    });

    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const signUrl = `${publicUrl}/sign/${envelope_id}?t=${token}`;
    // Canonical verify route is `/verify/<short_code>` — matches the SPA + audit-pdf QR.
    const verifyUrl = `${publicUrl}/verify/${envelope.short_code}`;
    // Pre-render the per-signer roster block — the template engine is
    // loop-free, so iteration has to happen here. Highlight the row for
    // this reminder's recipient with "(that's you)".
    const signerListHtml = buildSignerListHtmlFromSigners(envelope.signers, {
      highlightEmail: signer.email,
    });

    await this.outboundEmails.insert({
      envelope_id,
      signer_id,
      kind: 'reminder',
      to_email: signer.email,
      to_name: signer.name,
      source_event_id: event.id,
      payload: {
        sender_name: sender.name ?? sender.email,
        sender_email: sender.email,
        envelope_title: envelope.title,
        sign_url: signUrl,
        verify_url: verifyUrl,
        short_code: envelope.short_code,
        expires_at_readable: formatExpiresAt(envelope.expires_at),
        public_url: publicUrl,
        signer_list_html: signerListHtml,
      },
    });
  }
}

/**
 * Make an envelope title safe to use as a file-name base: collapse
 * whitespace, strip the characters Drive (and most OSes) reject in
 * names, trim, and cap at 120 chars. Falls back to a generic label when
 * the result is empty.
 */
function sanitizeFileBase(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned.length > 0 ? cleaned : 'Envelope';
}

/** ISO timestamp → "2026-04-24 13:05 UTC" for human-readable email copy. */
function formatUtc(iso: string): string {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

function formatExpiresAt(iso: string): string {
  // e.g., "2026-05-24 14:30 UTC" — deliberate over-simplification; templates
  // render this verbatim so consistency matters more than i18n for MVP.
  const date = new Date(iso);
  const pad = (num: number) => num.toString().padStart(2, '0');
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`
  );
}
