import { Inject, Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import {
  DriveFileNotFoundError,
  DRIVE_UPLOADER,
  type DriveUploadedFile,
  type DriveUploader,
} from './drive-uploader';
import { GDriveError, GdriveNotConnectedError } from './dto/error-codes';
import {
  GDRIVE_ENVELOPE_EXPORTS_REPOSITORY,
  type GdriveEnvelopeExport,
  type GdriveEnvelopeExportsRepository,
} from './gdrive-envelope-exports.repository';
import { GDriveService } from './gdrive.service';

/** Which of the two artifacts an upload outcome refers to. */
export type GdriveExportArtifactKind = 'sealed' | 'audit';

export interface GdriveExportFileResult {
  readonly kind: GdriveExportArtifactKind;
  readonly fileId: string;
  readonly name: string;
  readonly webViewLink: string;
}

export interface GdriveExportFolder {
  readonly id: string;
  readonly name: string;
  readonly webViewLink: string;
}

/**
 * One artifact to push. `path` is the Supabase Storage object key,
 * `name` the display name the Drive file should get.
 */
export interface GdriveExportArtifact {
  readonly kind: GdriveExportArtifactKind;
  readonly path: string;
  readonly name: string;
}

export interface ExportEnvelopeArgs {
  readonly userId: string;
  readonly envelopeId: string;
  readonly folderId: string;
  readonly folderName: string | null;
  /** Exactly the sealed + audit artifacts, in push order. */
  readonly artifacts: ReadonlyArray<GdriveExportArtifact>;
}

export interface ExportEnvelopeResult {
  readonly folder: GdriveExportFolder;
  readonly files: ReadonlyArray<GdriveExportFileResult>;
  /**
   * Set when the FIRST artifact uploaded but a LATER one failed — a
   * partial success. The record is still written with whatever ids
   * succeeded so a re-save retries the missing one. (If the first
   * artifact itself fails the whole operation throws.)
   */
  readonly partialError?: { readonly kind: GdriveExportArtifactKind; readonly code: string };
}

const PDF_MIME = 'application/pdf';

/**
 * Owns the server-side half of the "Save to Google Drive" feature: pick
 * the account, mint a token, upload (or update-in-place) each artifact,
 * and persist the export record. The artifact bytes flow Storage →
 * memory → Drive and never touch the browser; the Drive access token is
 * used for writes only.
 */
@Injectable()
export class GdriveExportService {
  private readonly logger = new Logger('GdriveExportService');

  constructor(
    private readonly gdrive: GDriveService,
    private readonly storage: StorageService,
    @Inject(DRIVE_UPLOADER) private readonly uploader: DriveUploader,
    @Inject(GDRIVE_ENVELOPE_EXPORTS_REPOSITORY)
    private readonly exportsRepo: GdriveEnvelopeExportsRepository,
  ) {}

  /**
   * Pick the account and mint a write token. `accountId` null means the
   * most-recently-used non-deleted account (`gdriveMultiAccount` is out of
   * scope for v1: one account, the freshest). A named account that is not
   * the user's live account is treated as not connected. The automation
   * Drive action (WP-32) shares this path so it never has a second token
   * flow. `TokenExpiredError` (revoked refresh token) bubbles through.
   */
  async openSession(
    userId: string,
    accountId: string | null,
  ): Promise<{ accountId: string; accessToken: string }> {
    const accounts = (await this.gdrive.listAccounts(userId)).filter((a) => !a.deletedAt);
    const candidates = accountId === null ? accounts : accounts.filter((a) => a.id === accountId);
    const sorted = [...candidates].sort((a, b) => {
      const at = a.lastUsedAt ?? a.connectedAt;
      const bt = b.lastUsedAt ?? b.connectedAt;
      return bt.localeCompare(at);
    });
    const account = sorted[0];
    if (account === undefined) throw new GdriveNotConnectedError();
    // getAccessToken collapses concurrent callers onto one Google refresh
    // and touches last_used_at on success.
    const { accessToken } = await this.gdrive.getAccessToken(account.id, userId);
    return { accountId: account.id, accessToken };
  }

  async exportEnvelope(args: ExportEnvelopeArgs): Promise<ExportEnvelopeResult> {
    const { accountId, accessToken } = await this.openSession(args.userId, null);

    const existing = await this.exportsRepo.findByEnvelopeAndAccount(args.envelopeId, accountId);
    // Recorded file ids are only reusable when the destination folder is
    // unchanged — a new folder means brand-new files there.
    const sameFolder = existing?.folderId === args.folderId;

    const uploaded: GdriveExportFileResult[] = [];
    let partialError: ExportEnvelopeResult['partialError'];
    const fileIds: Partial<Record<GdriveExportArtifactKind, string>> = {};

    for (let i = 0; i < args.artifacts.length; i++) {
      const artifact = args.artifacts[i];
      if (artifact === undefined) {
        throw new TypeError('gdrive export: missing artifact');
      }
      try {
        const bytes = await this.storage.download(artifact.path);
        const recordedId = sameFolder ? recordedFileId(existing, artifact.kind) : null;
        const result = await this.uploadOrUpdate({
          accessToken,
          recordedId,
          folderId: args.folderId,
          name: artifact.name,
          bytes,
        });
        uploaded.push({
          kind: artifact.kind,
          fileId: result.id,
          name: result.name || artifact.name,
          webViewLink: result.webViewLink,
        });
        fileIds[artifact.kind] = result.id;
      } catch (err) {
        if (i === 0) {
          // Nothing uploaded yet — the whole operation fails. Don't
          // touch the record.
          throw err;
        }
        // A later artifact failed: keep the partial result, still
        // persist what landed so a retry only re-pushes the failure.
        let code = 'unknown_error';
        if (err instanceof GDriveError) code = err.code;
        else if (err instanceof Error) code = err.name ?? 'unknown_error';
        this.logger.warn(
          `gdrive_export_partial envelope=${args.envelopeId} kind=${artifact.kind} err=${code}`,
        );
        partialError = { kind: artifact.kind, code };
        break;
      }
    }

    await this.exportsRepo.upsert({
      envelopeId: args.envelopeId,
      accountId,
      folderId: args.folderId,
      folderName: args.folderName,
      sealedFileId: fileIds.sealed ?? (sameFolder ? (existing?.sealedFileId ?? null) : null),
      auditFileId: fileIds.audit ?? (sameFolder ? (existing?.auditFileId ?? null) : null),
    });

    const folder: GdriveExportFolder = {
      id: args.folderId,
      name: args.folderName ?? args.folderId,
      // Constructed rather than fetched — saves a round-trip and works
      // for shared-drive folders too.
      webViewLink: `https://drive.google.com/drive/folders/${args.folderId}`,
    };
    return {
      folder,
      files: uploaded,
      ...(partialError !== undefined ? { partialError } : {}),
    };
  }

  /**
   * Update the recorded file in place when one exists; otherwise create
   * a fresh file in the folder. If the recorded id is stale (Drive
   * `404`), fall back to creating a new one.
   */
  private async uploadOrUpdate(args: {
    accessToken: string;
    recordedId: string | null;
    folderId: string;
    name: string;
    bytes: Buffer;
  }): Promise<DriveUploadedFile> {
    if (args.recordedId) {
      try {
        return await this.uploader.update({
          accessToken: args.accessToken,
          fileId: args.recordedId,
          bytes: args.bytes,
        });
      } catch (err) {
        if (!(err instanceof DriveFileNotFoundError)) throw err;
        // Recorded file was trashed/deleted — create a fresh one below.
      }
    }
    return this.uploader.create({
      accessToken: args.accessToken,
      metadata: { name: args.name, parents: [args.folderId], mimeType: PDF_MIME },
      bytes: args.bytes,
    });
  }
}

function recordedFileId(
  existing: GdriveEnvelopeExport | null,
  kind: GdriveExportArtifactKind,
): string | null {
  if (!existing) return null;
  return kind === 'sealed' ? existing.sealedFileId : existing.auditFileId;
}
