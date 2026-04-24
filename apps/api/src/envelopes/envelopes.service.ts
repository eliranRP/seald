import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import { ENVELOPE_STATUSES } from 'shared';
import type { Envelope as WireEnvelope } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { ContactsRepository } from '../contacts/contacts.repository';
import { StorageService } from '../storage/storage.service';
import type {
  CreateFieldInput,
  EnvelopeEvent,
  EnvelopeField,
  EnvelopeSigner,
  ListResult,
  SetOriginalFileInput,
  UpdateDraftMetadataPatch,
} from './envelopes.repository';
import {
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
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async createDraft(owner_id: string, dto: { title: string }): Promise<Envelope> {
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
    return envelope;
  }

  async list(
    owner_id: string,
    opts: { statuses?: readonly EnvelopeStatus[]; limit?: number; cursor?: string },
  ): Promise<ListResult> {
    const clampedLimit = Math.max(1, Math.min(100, opts.limit ?? 20));

    if (opts.statuses) {
      for (const s of opts.statuses) {
        if (!(ENVELOPE_STATUSES as readonly string[]).includes(s)) {
          throw new BadRequestException('validation_error');
        }
      }
    }

    let cursor: { updated_at: string; id: string } | null = null;
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
      cursor,
    });
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
    const updated = await this.repo.updateDraftMetadata(owner_id, id, sanitized);
    if (updated) return updated;
    const existing = await this.repo.findByIdForOwner(owner_id, id);
    if (!existing) throw new NotFoundException('envelope_not_found');
    throw new ConflictException('envelope_not_draft');
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

  async addSigner(
    owner_id: string,
    envelope_id: string,
    dto: { contact_id: string },
  ): Promise<EnvelopeSigner> {
    const envelope = await this.repo.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');

    const contact = await this.contactsRepo.findOneByOwner(owner_id, dto.contact_id);
    if (!contact) throw new NotFoundException('contact_not_found');

    try {
      return await this.repo.addSigner(envelope_id, {
        contact_id: contact.id,
        email: contact.email,
        name: contact.name,
        color: contact.color,
        role: 'signatory',
      });
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
}
