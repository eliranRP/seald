/**
 * Per-(envelope, account) record of the last "Save to Google Drive" push:
 * the destination folder + the Drive file ids of the sealed and audit PDFs.
 * Re-saving into the same folder updates those files in place; re-saving
 * into a different folder creates new ones and the record is overwritten.
 */
export interface GdriveEnvelopeExport {
  readonly id: string;
  readonly envelopeId: string;
  readonly accountId: string;
  readonly folderId: string;
  readonly folderName: string | null;
  readonly sealedFileId: string | null;
  readonly auditFileId: string | null;
  readonly lastPushedAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpsertGdriveEnvelopeExportArgs {
  readonly envelopeId: string;
  readonly accountId: string;
  readonly folderId: string;
  readonly folderName: string | null;
  readonly sealedFileId: string | null;
  readonly auditFileId: string | null;
}

/**
 * Port for `gdrive_envelope_exports` access. The Postgres adapter
 * (`gdrive-envelope-exports.repository.pg.ts`) is the only place that
 * touches Kysely; the unit suite swaps in a fake.
 */
export interface GdriveEnvelopeExportsRepository {
  findByEnvelopeAndAccount(
    envelopeId: string,
    accountId: string,
  ): Promise<GdriveEnvelopeExport | null>;
  /** Most recently pushed export row for this envelope (across accounts). */
  findLatestByEnvelope(envelopeId: string): Promise<GdriveEnvelopeExport | null>;
  /**
   * Insert or update the row on the `(envelope_id, account_id)` unique
   * constraint, stamping `last_pushed_at = now()` and bumping
   * `updated_at`. Returns the persisted row.
   */
  upsert(args: UpsertGdriveEnvelopeExportArgs): Promise<GdriveEnvelopeExport>;
}

export const GDRIVE_ENVELOPE_EXPORTS_REPOSITORY = Symbol('GDRIVE_ENVELOPE_EXPORTS_REPOSITORY');
