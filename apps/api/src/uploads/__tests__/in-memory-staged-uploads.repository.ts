import {
  StagedUploadsRepository,
  type CompleteOutcome,
  type CompleteStagedUpload,
  type InsertStagedUpload,
  type StagedUploadRecord,
} from '../staged-uploads.repository';

type Row = { -readonly [K in keyof StagedUploadRecord]: StagedUploadRecord[K] };

/** Same rules as the pg adapter over a map. `nowMs` drives every "now". */
export class InMemoryStagedUploadsRepository extends StagedUploadsRepository {
  readonly rows = new Map<string, Row>();
  /** `${envelope_id}/${document_id}` → Drive source name. */
  readonly driveSources = new Map<string, string>();
  nowMs = Date.parse('2026-10-02T12:00:00.000Z');

  private now(): string {
    return new Date(this.nowMs).toISOString();
  }

  async insert(input: InsertStagedUpload): Promise<StagedUploadRecord> {
    const row: Row = {
      id: input.id,
      owner_id: input.owner_id,
      storage_key: input.storage_key,
      filename: input.filename,
      mime: null,
      sha256: null,
      byte_length: null,
      page_count: null,
      thumbnail_url: null,
      source: input.source,
      drive_file_id: input.drive_file_id ?? null,
      drive_file_name: input.drive_file_name ?? null,
      conversion_job_id: null,
      expires_at: input.expires_at,
      completed_at: null,
      consumed_at: null,
      created_at: this.now(),
    };
    this.rows.set(row.id, row);
    return { ...row };
  }

  private owned(owner_id: string, id: string): Row | undefined {
    const row = this.rows.get(id);
    return row && row.owner_id === owner_id ? row : undefined;
  }

  async find(owner_id: string, id: string): Promise<StagedUploadRecord | null> {
    const row = this.owned(owner_id, id);
    return row ? { ...row } : null;
  }

  async findByJob(owner_id: string, job_id: string): Promise<StagedUploadRecord | null> {
    const row = [...this.rows.values()].find(
      (r) => r.owner_id === owner_id && r.conversion_job_id === job_id,
    );
    return row ? { ...row } : null;
  }

  async setConversionJob(owner_id: string, id: string, job_id: string): Promise<void> {
    const row = this.owned(owner_id, id);
    if (row) row.conversion_job_id = job_id;
  }

  async complete(input: CompleteStagedUpload): Promise<CompleteOutcome> {
    const day = new Date(this.nowMs);
    const midnight = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
    const used = [...this.rows.values()].filter(
      (r) =>
        r.owner_id === input.owner_id &&
        r.completed_at !== null &&
        Date.parse(r.completed_at) >= midnight,
    ).length;
    if (used >= input.daily_cap) return 'daily_cap';
    const row = this.owned(input.owner_id, input.id);
    if (!row || row.completed_at !== null) return 'not_pending';
    Object.assign(row, {
      completed_at: this.now(),
      mime: input.mime,
      sha256: input.sha256,
      byte_length: input.byte_length,
      page_count: input.page_count,
    });
    return 'completed';
  }

  async countCompletedSince(owner_id: string, since: string): Promise<number> {
    return [...this.rows.values()].filter(
      (r) =>
        r.owner_id === owner_id &&
        r.completed_at !== null &&
        Date.parse(r.completed_at) >= Date.parse(since),
    ).length;
  }

  async consume(owner_id: string, id: string): Promise<StagedUploadRecord | null> {
    const row = this.owned(owner_id, id);
    if (
      !row ||
      row.completed_at === null ||
      row.consumed_at !== null ||
      Date.parse(row.expires_at) <= this.nowMs
    ) {
      return null;
    }
    row.consumed_at = this.now();
    return { ...row };
  }

  async releaseClaim(owner_id: string, id: string): Promise<void> {
    const row = this.owned(owner_id, id);
    if (row) row.consumed_at = null;
  }

  async delete(owner_id: string, id: string): Promise<void> {
    if (this.owned(owner_id, id)) this.rows.delete(id);
  }

  async listExpiredUnattached(
    now: string,
    limit: number,
  ): Promise<ReadonlyArray<StagedUploadRecord>> {
    return [...this.rows.values()]
      .filter((r) => r.consumed_at === null && Date.parse(r.expires_at) <= Date.parse(now))
      .sort((a, b) => Date.parse(a.expires_at) - Date.parse(b.expires_at))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async deleteMany(ids: ReadonlyArray<string>): Promise<number> {
    let n = 0;
    for (const id of ids) {
      const row = this.rows.get(id);
      if (row && row.consumed_at === null) {
        this.rows.delete(id);
        n += 1;
      }
    }
    return n;
  }

  async listStorageKeys(owner_id: string): Promise<ReadonlyArray<string>> {
    return [...this.rows.values()].filter((r) => r.owner_id === owner_id).map((r) => r.storage_key);
  }

  async setDocumentDriveSource(
    envelope_id: string,
    document_id: string,
    drive_file_name: string,
  ): Promise<void> {
    this.driveSources.set(`${envelope_id}/${document_id}`, drive_file_name);
  }
}
