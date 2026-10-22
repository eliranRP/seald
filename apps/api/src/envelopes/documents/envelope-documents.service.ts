import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { MAX_ENVELOPE_DOCUMENTS } from 'shared';
import type { EnvelopeDocument } from 'shared';
import { StorageService } from '../../storage/storage.service';
import type { Envelope, EnvelopeField } from '../envelope.entity';
import { EnvelopesRepository, type CreateFieldInput } from '../envelopes.repository';
import { inspectPdfBytes } from '../pdf-inspection';
import { documentOriginalPath, legacyOriginalPath, sealedBundlePath } from './document-paths';
import {
  DocumentEnvelopeNotDraftError,
  EnvelopeDocumentsRepository,
  TooManyDocumentsError,
  type EnvelopeDocumentRecord,
} from './envelope-documents.repository';
import { buildStoredZip, type ZipEntry } from './zip-store';

export type DocumentDownloadKind = 'original' | 'sealed';

/** Wire shape of one document: no storage paths. */
export function toWireDocument(doc: EnvelopeDocumentRecord): EnvelopeDocument {
  return {
    id: doc.id,
    ord: doc.ord,
    title: doc.title,
    original_pages: doc.original_pages,
    original_sha256: doc.original_sha256,
    sealed_sha256: doc.sealed_sha256,
  };
}

/**
 * WP-03 — documents of an envelope: add, list, reorder and remove on
 * drafts, plus the read helpers that the envelope detail, field
 * placement, downloads and signing use while `multiDocumentEnvelopes` is
 * on. Controllers gate on the flag; this service does not, so the
 * sealing job and the MCP/REST adapters share it.
 *
 * Document 1 always uses the legacy storage path and is mirrored on the
 * envelope row; see migration 0022.
 */
@Injectable()
export class EnvelopeDocumentsService {
  private readonly logger = new Logger(EnvelopeDocumentsService.name);

  constructor(
    private readonly envelopes: EnvelopesRepository,
    private readonly docs: EnvelopeDocumentsRepository,
    private readonly storage: StorageService,
  ) {}

  async list(owner_id: string, envelope_id: string): Promise<EnvelopeDocument[]> {
    await this.requireOwned(owner_id, envelope_id);
    const docs = await this.docs.listByEnvelope(envelope_id);
    return docs.map(toWireDocument);
  }

  /** Documents of an envelope without an owner check (signer session, worker). */
  async listForEnvelope(envelope_id: string): Promise<EnvelopeDocument[]> {
    return (await this.docs.listByEnvelope(envelope_id)).map(toWireDocument);
  }

  /** Signed URL for one document's original PDF (signer view). */
  async originalSignedUrl(
    envelope_id: string,
    document_id: string,
    ttlSeconds: number,
  ): Promise<string> {
    const path = await this.documentPath(envelope_id, document_id, 'original');
    if (path === null) throw new NotFoundException('document_not_found');
    return this.storage.createSignedUrl(path, ttlSeconds);
  }

  /**
   * Add a PDF to a draft. The first upload fills document 1 (created empty
   * with the draft) at the legacy path; later uploads append. Appends a
   * `document_added` event to the hash chain (S.6).
   */
  async add(
    owner_id: string,
    envelope_id: string,
    body: Buffer,
    title: string | null,
  ): Promise<EnvelopeDocument> {
    const envelope = await this.requireDraft(owner_id, envelope_id);
    const { pages, sha256 } = await inspectPdfBytes(body);
    const docs = await this.docs.listByEnvelope(envelope_id);
    const first = docs[0];

    let doc: EnvelopeDocumentRecord;
    if (!first || first.original_file_path === null) {
      // Empty slot 1: same storage + envelope-row write as the legacy upload.
      const file_path = first?.original_file_path ?? legacyOriginalPath(envelope_id);
      await this.storage.upload(file_path, body, 'application/pdf');
      const updated = await this.envelopes.setOriginalFile(envelope_id, {
        file_path,
        sha256,
        pages,
      });
      if (!updated) throw new ConflictException('envelope_not_draft');
      const after = await this.docs.listByEnvelope(envelope_id);
      const primary = after[0];
      if (!primary) throw new Error('document_1_missing_after_upload');
      if (title !== null) await this.docs.setTitle(envelope_id, primary.id, title);
      doc = { ...primary, ...(title !== null ? { title } : {}) };
    } else {
      if (docs.length >= MAX_ENVELOPE_DOCUMENTS) throw new ConflictException('too_many_documents');
      const id = randomUUID();
      const file_path = documentOriginalPath(envelope_id, id);
      await this.storage.upload(file_path, body, 'application/pdf');
      try {
        doc = await this.docs.insertDocument({
          id,
          envelope_id,
          title: title ?? `Document ${docs.length + 1}`,
          original_file_path: file_path,
          original_sha256: sha256,
          original_pages: pages,
          max_documents: MAX_ENVELOPE_DOCUMENTS,
        });
      } catch (err) {
        await this.removeObjects([file_path]);
        throw mapRepoError(err);
      }
    }

    await this.envelopes.appendEvent({
      envelope_id: envelope.id,
      actor_kind: 'sender',
      event_type: 'document_added',
      metadata: { document_id: doc.id, ord: doc.ord, bytes_hash: sha256, pages },
    });
    return toWireDocument(doc);
  }

  /**
   * Legacy `POST /envelopes/:id/upload` while the flag is on: replace the
   * PDF of document 1 in place. Writes to document 1's own path, which is
   * not the legacy one once a reorder moved another document into slot 1.
   */
  async replacePrimary(owner_id: string, envelope_id: string, body: Buffer): Promise<Envelope> {
    await this.requireDraft(owner_id, envelope_id);
    const { pages, sha256 } = await inspectPdfBytes(body);
    const docs = await this.docs.listByEnvelope(envelope_id);
    const file_path = docs[0]?.original_file_path ?? legacyOriginalPath(envelope_id);
    await this.storage.upload(file_path, body, 'application/pdf');
    const updated = await this.envelopes.setOriginalFile(envelope_id, { file_path, sha256, pages });
    if (!updated) throw new ConflictException('envelope_not_draft');
    await this.envelopes.appendEvent({
      envelope_id,
      actor_kind: 'sender',
      event_type: 'pdf_uploaded',
      metadata: { bytes_hash: sha256, pages },
    });
    return updated;
  }

  async remove(owner_id: string, envelope_id: string, document_id: string): Promise<void> {
    await this.requireDraft(owner_id, envelope_id);
    const docs = await this.docs.listByEnvelope(envelope_id);
    if (!docs.some((d) => d.id === document_id)) throw new NotFoundException('document_not_found');
    if (docs.length <= 1) throw new ConflictException('last_document');
    let removed: EnvelopeDocumentRecord | null;
    try {
      removed = await this.docs.removeDocument(envelope_id, document_id);
    } catch (err) {
      throw mapRepoError(err);
    }
    if (!removed) throw new NotFoundException('document_not_found');
    if (removed.original_file_path !== null) await this.removeObjects([removed.original_file_path]);
  }

  async reorder(
    owner_id: string,
    envelope_id: string,
    document_ids: ReadonlyArray<string>,
  ): Promise<EnvelopeDocument[]> {
    await this.requireDraft(owner_id, envelope_id);
    const docs = await this.docs.listByEnvelope(envelope_id);
    const current = new Set(docs.map((d) => d.id));
    const given = new Set(document_ids);
    if (
      given.size !== document_ids.length ||
      given.size !== current.size ||
      [...given].some((id) => !current.has(id))
    ) {
      throw new BadRequestException('document_order_invalid');
    }
    try {
      const next = await this.docs.reorder(envelope_id, document_ids);
      return next.map(toWireDocument);
    } catch (err) {
      throw mapRepoError(err);
    }
  }

  /**
   * Check that every `document_id` on a field placement belongs to the
   * envelope. Fields without one land on document 1.
   */
  async assertFieldDocuments(
    envelope_id: string,
    fields: ReadonlyArray<CreateFieldInput>,
  ): Promise<void> {
    if (!fields.some((f) => f.document_id !== undefined)) return;
    const ids = new Set((await this.docs.listByEnvelope(envelope_id)).map((d) => d.id));
    for (const f of fields) {
      if (f.document_id !== undefined && !ids.has(f.document_id)) {
        throw new BadRequestException('document_not_in_envelope');
      }
    }
  }

  /** The envelope with `documents[]` and each field's `document_id`. */
  async decorateEnvelope<T extends Envelope>(envelope: T): Promise<T> {
    const [docs, fields] = await Promise.all([
      this.docs.listByEnvelope(envelope.id),
      this.decorateFields(envelope.id, envelope.fields),
    ]);
    return { ...envelope, fields, documents: docs.map(toWireDocument) };
  }

  async decorateFields(
    envelope_id: string,
    fields: ReadonlyArray<EnvelopeField>,
  ): Promise<EnvelopeField[]> {
    const [docs, byField] = await Promise.all([
      this.docs.listByEnvelope(envelope_id),
      this.docs.listFieldDocumentIds(envelope_id),
    ]);
    const primary = docs[0]?.id;
    return fields.map((f) => {
      const document_id = byField.get(f.id) ?? f.document_id ?? primary;
      return document_id === undefined ? { ...f } : { ...f, document_id };
    });
  }

  /** Storage path of one document's original or sealed PDF, or null if not produced yet. */
  async documentPath(
    envelope_id: string,
    document_id: string,
    kind: DocumentDownloadKind,
  ): Promise<string | null> {
    const doc = (await this.docs.listByEnvelope(envelope_id)).find((d) => d.id === document_id);
    if (!doc) throw new NotFoundException('document_not_found');
    if (kind === 'sealed') return doc.sealed_file_path;
    return doc.original_file_path ?? (doc.ord === 1 ? legacyOriginalPath(envelope_id) : null);
  }

  /**
   * Zip of every sealed document plus audit.pdf for a completed envelope.
   * Built once and cached at `{id}/documents.zip`; the inputs never change
   * after sealing. Returns the storage path.
   */
  async sealedBundle(envelope: Envelope, audit_file_path: string): Promise<string> {
    const path = sealedBundlePath(envelope.id);
    if (await this.storage.exists(path)) return path;
    const docs = await this.docs.listByEnvelope(envelope.id);
    const entries: ZipEntry[] = [];
    const used = new Set<string>();
    for (const doc of docs) {
      if (doc.sealed_file_path === null) throw new ConflictException('envelope_not_sealed');
      const name = uniqueName(
        used,
        `${String(doc.ord).padStart(2, '0')} ${fileBase(doc.title)}.pdf`,
      );
      entries.push({ name, data: await this.storage.download(doc.sealed_file_path) });
    }
    entries.push({
      name: uniqueName(used, 'audit-trail.pdf'),
      data: await this.storage.download(audit_file_path),
    });
    const mtime = new Date(envelope.completed_at ?? envelope.updated_at);
    await this.storage.upload(path, buildStoredZip(entries, mtime), 'application/zip');
    return path;
  }

  /**
   * Flag-on downloads: one document's PDF (`document_id`, `kind`
   * original|sealed, default sealed when present) or `kind=zip` for every
   * sealed document plus audit.pdf. 5-minute signed URL, like the legacy
   * route.
   */
  async downloadUrl(
    owner_id: string,
    envelope_id: string,
    args: { readonly document_id?: string; readonly kind?: DocumentDownloadKind | 'zip' },
  ): Promise<{ url: string; kind: DocumentDownloadKind | 'zip'; document_id?: string }> {
    const envelope = await this.requireOwned(owner_id, envelope_id);
    if (args.kind === 'zip') {
      const paths = await this.envelopes.getFilePaths(envelope_id);
      if (envelope.status !== 'completed' || !paths?.audit_file_path) {
        throw new BadRequestException('file_not_ready');
      }
      const path = await this.sealedBundle(envelope, paths.audit_file_path);
      return { url: await this.storage.createSignedUrl(path, 300), kind: 'zip' };
    }
    if (args.document_id === undefined) throw new BadRequestException('validation_error');
    let kind: DocumentDownloadKind = args.kind ?? 'sealed';
    let path = await this.documentPath(envelope_id, args.document_id, kind);
    if (path === null && args.kind === undefined) {
      kind = 'original';
      path = await this.documentPath(envelope_id, args.document_id, kind);
    }
    if (path === null) throw new BadRequestException('file_not_ready');
    return {
      url: await this.storage.createSignedUrl(path, 300),
      kind,
      document_id: args.document_id,
    };
  }

  private async requireOwned(owner_id: string, envelope_id: string): Promise<Envelope> {
    const envelope = await this.envelopes.findByIdForOwner(owner_id, envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    return envelope;
  }

  private async requireDraft(owner_id: string, envelope_id: string): Promise<Envelope> {
    const envelope = await this.requireOwned(owner_id, envelope_id);
    if (envelope.status !== 'draft') throw new ConflictException('envelope_not_draft');
    return envelope;
  }

  private async removeObjects(paths: string[]): Promise<void> {
    try {
      await this.storage.remove(paths);
    } catch (err) {
      this.logger.warn(
        `could not delete ${paths.join(', ')}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function mapRepoError(err: unknown): unknown {
  if (err instanceof TooManyDocumentsError) return new ConflictException('too_many_documents');
  if (err instanceof DocumentEnvelopeNotDraftError)
    return new ConflictException('envelope_not_draft');
  return err;
}

/** Title → safe file-name base (same rules as the Drive export). */
function fileBase(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned.length > 0 ? cleaned : 'Document';
}

function uniqueName(used: Set<string>, name: string): string {
  let candidate = name;
  for (let n = 2; used.has(candidate); n++) candidate = name.replace(/\.pdf$/, ` (${n}).pdf`);
  used.add(candidate);
  return candidate;
}

/** Document title from an upload's file name: no extension, 1–200 chars. */
export function titleFromFilename(name: string | undefined): string | null {
  if (!name) return null;
  const base = name
    .replace(/\.pdf$/i, '')
    .trim()
    .slice(0, 200)
    .trim();
  return base.length > 0 ? base : null;
}
