import { randomUUID } from 'node:crypto';
import {
  DocumentEnvelopeNotDraftError,
  EnvelopeDocumentsRepository,
  TooManyDocumentsError,
  type EnvelopeDocumentRecord,
  type InsertDocumentInput,
} from '../src/envelopes/documents/envelope-documents.repository';
import type { InMemoryEnvelopesRepository } from './in-memory-envelopes-repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type DocRow = Mutable<EnvelopeDocumentRecord>;

interface LegacySnapshot {
  readonly original_file_path: string | null;
  readonly original_sha256: string | null;
  readonly original_pages: number | null;
  readonly sealed_file_path: string | null;
  readonly sealed_sha256: string | null;
}

/**
 * In-memory EnvelopeDocumentsRepository for e2e and unit tests (WP-03).
 *
 * Backed by an InMemoryEnvelopesRepository, it simulates the two 0022
 * triggers: every envelope gets document 1 the first time it is looked
 * at, and a change to the envelope's legacy original/sealed values is
 * copied into document 1. Field → document links come from the envelope
 * fake's `fieldDocuments` side map (default: document 1).
 *
 * Without an envelopes fake it is an empty repository: every envelope has
 * no document rows, so sealing takes its single-legacy-document path.
 */
export class InMemoryEnvelopeDocumentsRepository extends EnvelopeDocumentsRepository {
  private readonly docs = new Map<string, DocRow[]>();
  private readonly lastSeen = new Map<string, string>();

  constructor(private readonly envelopes?: InMemoryEnvelopesRepository) {
    super();
  }

  reset(): void {
    this.docs.clear();
    this.lastSeen.clear();
  }

  async listByEnvelope(envelope_id: string): Promise<ReadonlyArray<EnvelopeDocumentRecord>> {
    return this.rows(envelope_id).map((d) => ({ ...d }));
  }

  async insertDocument(input: InsertDocumentInput): Promise<EnvelopeDocumentRecord> {
    this.requireDraft(input.envelope_id);
    const rows = this.rows(input.envelope_id);
    if (rows.length >= input.max_documents) throw new TooManyDocumentsError();
    const ord = rows.reduce((max, d) => Math.max(max, d.ord), 0) + 1;
    const row: DocRow = {
      id: input.id,
      envelope_id: input.envelope_id,
      ord,
      title: input.title,
      original_file_path: input.original_file_path,
      original_sha256: input.original_sha256,
      original_pages: input.original_pages,
      sealed_file_path: null,
      sealed_sha256: null,
    };
    rows.push(row);
    this.docs.set(input.envelope_id, rows);
    if (ord === 1) this.mirrorPrimary(input.envelope_id);
    return { ...row };
  }

  async setTitle(envelope_id: string, document_id: string, title: string): Promise<boolean> {
    const row = this.rows(envelope_id).find((d) => d.id === document_id);
    if (!row) return false;
    row.title = title;
    return true;
  }

  async removeDocument(
    envelope_id: string,
    document_id: string,
  ): Promise<EnvelopeDocumentRecord | null> {
    this.requireDraft(envelope_id);
    const rows = this.rows(envelope_id);
    const removed = rows.find((d) => d.id === document_id);
    if (!removed) return null;
    this.pinDefaultFields(envelope_id, rows);
    const rest = rows.filter((d) => d.id !== document_id).sort((a, b) => a.ord - b.ord);
    rest.forEach((d, i) => {
      d.ord = i + 1;
    });
    this.docs.set(envelope_id, rest);
    // FK cascade: fields on the removed document go with it.
    const env = this.envelopes?.envelopes.get(envelope_id);
    if (env && this.envelopes) {
      const links = this.envelopes.fieldDocuments;
      const keep = env.fields.filter((f) => links.get(f.id) !== removed.id);
      this.envelopes.envelopes.set(envelope_id, { ...env, fields: keep });
    }
    if (removed.ord === 1) this.mirrorPrimary(envelope_id);
    return { ...removed };
  }

  async reorder(
    envelope_id: string,
    document_ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<EnvelopeDocumentRecord>> {
    this.requireDraft(envelope_id);
    const rows = this.rows(envelope_id);
    // Fields placed on the old document 1 without an explicit id must stay
    // on that document, as the pg column does.
    this.pinDefaultFields(envelope_id, rows);
    const next = document_ids.map((id, i) => {
      const row = rows.find((d) => d.id === id);
      if (!row) throw new Error(`unknown document ${id}`);
      row.ord = i + 1;
      return row;
    });
    this.docs.set(envelope_id, next);
    this.mirrorPrimary(envelope_id);
    return next.map((d) => ({ ...d }));
  }

  async listFieldDocumentIds(envelope_id: string): Promise<ReadonlyMap<string, string>> {
    const rows = this.rows(envelope_id);
    const first = rows[0]?.id;
    const env = this.envelopes?.envelopes.get(envelope_id);
    const out = new Map<string, string>();
    if (!env || first === undefined) return out;
    for (const f of env.fields) {
      out.set(f.id, this.envelopes!.fieldDocuments.get(f.id) ?? first);
    }
    return out;
  }

  async setSealed(
    document_id: string,
    sealed_file_path: string,
    sealed_sha256: string,
  ): Promise<void> {
    for (const rows of this.docs.values()) {
      const row = rows.find((d) => d.id === document_id);
      if (row) {
        row.sealed_file_path = sealed_file_path;
        row.sealed_sha256 = sealed_sha256;
      }
    }
  }

  /** Rows of an envelope, after the simulated 0022 triggers ran. */
  private rows(envelope_id: string): DocRow[] {
    const repo = this.envelopes;
    const env = repo?.envelopes.get(envelope_id);
    if (!repo || !env) return this.docs.get(envelope_id) ?? [];
    let rows = this.docs.get(envelope_id);
    const legacy = this.legacy(envelope_id);
    if (!rows || rows.length === 0) {
      rows = [
        {
          id: randomUUID(),
          envelope_id,
          ord: 1,
          title: env.title,
          ...legacy,
        },
      ];
      this.docs.set(envelope_id, rows);
      this.lastSeen.set(envelope_id, JSON.stringify(legacy));
      return rows.sort((a, b) => a.ord - b.ord);
    }
    const key = JSON.stringify(legacy);
    if (this.lastSeen.get(envelope_id) !== key) {
      const first = rows.find((d) => d.ord === 1);
      if (first) Object.assign(first, legacy);
      this.lastSeen.set(envelope_id, key);
    }
    return rows.sort((a, b) => a.ord - b.ord);
  }

  private legacy(envelope_id: string): LegacySnapshot {
    const repo = this.envelopes!;
    const env = repo.envelopes.get(envelope_id)!;
    return {
      original_file_path: repo.originalPaths.get(envelope_id) ?? null,
      original_sha256: env.original_sha256,
      original_pages: env.original_pages,
      sealed_file_path: repo.sealedPaths.get(envelope_id) ?? null,
      sealed_sha256: env.sealed_sha256,
    };
  }

  private pinDefaultFields(envelope_id: string, rows: ReadonlyArray<DocRow>): void {
    const repo = this.envelopes;
    const env = repo?.envelopes.get(envelope_id);
    const first = rows.find((d) => d.ord === 1)?.id;
    if (!repo || !env || first === undefined) return;
    for (const f of env.fields) {
      if (!repo.fieldDocuments.has(f.id)) repo.fieldDocuments.set(f.id, first);
    }
  }

  /** Copy document 1 onto the envelope fake's legacy values (as the pg adapter does). */
  private mirrorPrimary(envelope_id: string): void {
    const repo = this.envelopes;
    const env = repo?.envelopes.get(envelope_id);
    const first = this.docs.get(envelope_id)?.find((d) => d.ord === 1);
    if (!repo || !env || !first) return;
    repo.envelopes.set(envelope_id, {
      ...env,
      original_sha256: first.original_sha256,
      original_pages: first.original_pages,
    });
    if (first.original_file_path !== null) {
      repo.originalPaths.set(envelope_id, first.original_file_path);
    } else {
      repo.originalPaths.delete(envelope_id);
    }
    this.lastSeen.set(envelope_id, JSON.stringify(this.legacy(envelope_id)));
  }

  private requireDraft(envelope_id: string): void {
    const env = this.envelopes?.envelopes.get(envelope_id);
    if (this.envelopes && (!env || env.status !== 'draft'))
      throw new DocumentEnvelopeNotDraftError();
  }
}
