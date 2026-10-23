import { Inject, Injectable, Logger } from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import {
  DriveFileNotFoundError,
  DRIVE_UPLOADER,
  type DriveFolderOps,
  type DriveUploader,
} from '../../../integrations/gdrive/drive-uploader';
import {
  DrivePermissionDeniedError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../../../integrations/gdrive/dto/error-codes';
import { GdriveExportService } from '../../../integrations/gdrive/gdrive-export.service';
import { GDriveRateLimiter, RateLimitedError } from '../../../integrations/gdrive/rate-limiter';
import { StorageService } from '../../../storage/storage.service';
import type { AutomationActionExecutor, AutomationActionOutcome } from '../../automation-actions';
import type { ClaimedAutomationJob } from '../../automations.repository.pg';
import {
  buildUploadPlan,
  DEFAULT_DRIVE_FOLDER_LABEL,
  DEFAULT_DRIVE_FOLDER_LEAF,
  DRIVE_ROOT_ID,
  parseGdriveUploadConfig,
  type UploadPlanItem,
} from './gdrive-upload.config';
import { GdriveUploadRepository } from './gdrive-upload.repository';

const PDF_MIME = 'application/pdf';
const DEFAULT_MAX_BYTES = 26_214_400;

/** Terminal outcome carried out of the upload loop. */
class OutcomeError extends Error {
  constructor(readonly outcome: AutomationActionOutcome) {
    super('gdrive_upload_outcome');
  }
}

/**
 * The `gdrive_upload` action (recipe `sealed_save_drive`, A6). One attempt
 * uploads every sealed PDF of the envelope (one per document) plus
 * `audit.pdf` into the owner's Drive folder, through the existing Drive
 * path: `GdriveExportService.openSession` (account pick + token refresh),
 * `GDriveRateLimiter`, and the `DriveUploader`. Scope stays `drive.file`.
 *
 * Default folder: when the recipe has no `folder_id`, the attempt looks for
 * an app-created "Seald" folder in My Drive, creates one if missing, and
 * remembers its id on the recipe.
 *
 * Idempotent: file names are deterministic, and each upload first looks the
 * name up in the folder and updates in place when found, so a retry after a
 * partial upload (or a re-run) never makes a duplicate.
 *
 * Failures: no connected account, revoked token, a folder the app cannot
 * write, a missing folder and bad config are permanent. A rate limit, 5xx
 * or transport error is transient. Slugs only: never Google's body.
 */
@Injectable()
export class GdriveUploadActionExecutor implements AutomationActionExecutor {
  private readonly logger = new Logger(GdriveUploadActionExecutor.name);

  constructor(
    private readonly repo: GdriveUploadRepository,
    private readonly exporter: GdriveExportService,
    private readonly storage: StorageService,
    private readonly limiter: GDriveRateLimiter,
    @Inject(DRIVE_UPLOADER) private readonly drive: DriveUploader & DriveFolderOps,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async execute(job: ClaimedAutomationJob): Promise<AutomationActionOutcome> {
    const outcome = await this.attempt(job);
    if (outcome.kind !== 'done') {
      this.logger.warn(`gdrive_upload run ${job.run_id} ${outcome.kind} ${outcome.slug}`);
    }
    return outcome;
  }

  private async attempt(job: ClaimedAutomationJob): Promise<AutomationActionOutcome> {
    if (job.action !== 'gdrive_upload') return { kind: 'permanent', slug: 'bad_config' };
    if (!isFeatureEnabled('gdriveIntegration')) {
      return { kind: 'permanent', slug: 'gdrive_disabled' };
    }
    const config = parseGdriveUploadConfig(job.config);
    if (!config.ok) return { kind: 'permanent', slug: config.slug };
    if (job.envelope_id === null) return { kind: 'permanent', slug: 'envelope_missing' };

    const ctx = await this.repo.loadContext({ ownerId: job.owner_id, envelopeId: job.envelope_id });
    if (!ctx) return { kind: 'permanent', slug: 'envelope_missing' };
    const plan = this.planFor(ctx);
    if (plan === null) return { kind: 'permanent', slug: 'envelope_not_sealed' };

    try {
      await this.limiter.acquire(job.owner_id);
      const session = await this.exporter.openSession(job.owner_id, config.accountId);
      const folderId = await this.resolveFolder(job, config.folderId, session.accessToken);
      for (const item of plan) {
        await this.upload(job.owner_id, session.accessToken, folderId, item);
      }
      return { kind: 'done' };
    } catch (err) {
      return this.classify(err);
    }
  }

  private planFor(
    ctx: NonNullable<Awaited<ReturnType<GdriveUploadRepository['loadContext']>>>,
  ): ReadonlyArray<UploadPlanItem> | null {
    const { envelope } = ctx;
    if (envelope.auditPath === null) return null;
    const documents =
      ctx.documents.length > 0
        ? ctx.documents
        : [{ ord: 1, title: envelope.title, sealedPath: envelope.sealedPath }];
    const sealed: { ord: number; title: string; sealedPath: string }[] = [];
    for (const doc of documents) {
      if (doc.sealedPath === null) return null;
      sealed.push({ ord: doc.ord, title: doc.title, sealedPath: doc.sealedPath });
    }
    return buildUploadPlan({
      envelopeId: envelope.id,
      title: envelope.title,
      documents: sealed,
      auditPath: envelope.auditPath,
    });
  }

  private async resolveFolder(
    job: ClaimedAutomationJob,
    stored: string | null,
    accessToken: string,
  ): Promise<string> {
    if (stored !== null) return stored;
    await this.limiter.acquire(job.owner_id);
    const existing = await this.drive.findFileByName({
      accessToken,
      name: DEFAULT_DRIVE_FOLDER_LEAF,
      parentId: DRIVE_ROOT_ID,
      folder: true,
    });
    let folderId = existing?.id ?? null;
    if (folderId === null) {
      await this.limiter.acquire(job.owner_id);
      const created = await this.drive.createFolder({
        accessToken,
        name: DEFAULT_DRIVE_FOLDER_LEAF,
      });
      folderId = created.id;
    }
    return this.repo.rememberFolder({
      ownerId: job.owner_id,
      automationId: job.automation_id,
      folderId,
      folderName: DEFAULT_DRIVE_FOLDER_LABEL,
    });
  }

  private async upload(
    ownerId: string,
    accessToken: string,
    folderId: string,
    item: UploadPlanItem,
  ): Promise<void> {
    const maxBytes = this.env.GDRIVE_CONVERSION_MAX_BYTES ?? DEFAULT_MAX_BYTES;
    await this.limiter.acquire(ownerId);
    const found = await this.drive.findFileByName({
      accessToken,
      name: item.name,
      parentId: folderId,
    });
    const bytes = await this.storage.download(item.path);
    if (bytes.length > maxBytes) {
      throw new OutcomeError({ kind: 'permanent', slug: 'file_too_large' });
    }
    if (found !== null) {
      try {
        await this.limiter.acquire(ownerId);
        await this.drive.update({ accessToken, fileId: found.id, bytes });
        return;
      } catch (err) {
        if (!(err instanceof DriveFileNotFoundError)) throw err;
        // Trashed between the lookup and the update: create below.
      }
    }
    await this.limiter.acquire(ownerId);
    await this.drive.create({
      accessToken,
      metadata: { name: item.name, parents: [folderId], mimeType: PDF_MIME },
      bytes,
    });
  }

  private classify(err: unknown): AutomationActionOutcome {
    if (err instanceof OutcomeError) return err.outcome;
    if (err instanceof RateLimitedError) {
      return { kind: 'transient', slug: 'rate_limited', retryAfterMs: err.retryAfterMs };
    }
    if (err instanceof GdriveNotConnectedError) {
      return { kind: 'permanent', slug: 'gdrive_not_connected' };
    }
    if (err instanceof TokenExpiredError) return { kind: 'permanent', slug: 'reconnect_required' };
    if (err instanceof DrivePermissionDeniedError) {
      return { kind: 'permanent', slug: 'permission-denied' };
    }
    // Create into a folder that no longer exists.
    if (err instanceof DriveFileNotFoundError)
      return { kind: 'permanent', slug: 'folder_not_found' };
    // Drive 5xx, transport and storage errors: retried with backoff.
    return { kind: 'transient', slug: 'drive_upload_failed' };
  }
}
