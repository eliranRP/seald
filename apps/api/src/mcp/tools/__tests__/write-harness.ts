import { randomUUID } from 'node:crypto';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { PDFDocument } from 'pdf-lib';
import { FEATURE_FLAGS, type ApiKeyScope, type FeatureFlag } from 'shared';
import { InMemoryContactsRepository } from '../../../../test/in-memory-contacts-repository';
import { InMemoryEnvelopeDocumentsRepository } from '../../../../test/in-memory-envelope-documents-repository';
import { InMemoryEnvelopesRepository } from '../../../../test/in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from '../../../../test/in-memory-outbound-emails-repository';
import { InMemoryStorageService } from '../../../../test/in-memory-storage';
import type { ApiKeyPrincipal } from '../../../api-keys/api-key-auth.service';
import type { AppEnv } from '../../../config/env.schema';
import { EnvelopeDocumentsService } from '../../../envelopes/documents/envelope-documents.service';
import { EnvelopesService } from '../../../envelopes/envelopes.service';
import { InMemoryIdempotencyRecordsRepository } from '../../../idempotency/__tests__/in-memory-idempotency-records.repository';
import { IdempotencyService } from '../../../idempotency/idempotency.service';
import type { GdriveExportService } from '../../../integrations/gdrive/gdrive-export.service';
import type { GdriveEnvelopeExportsRepository } from '../../../integrations/gdrive/gdrive-envelope-exports.repository';
import {
  DriveImportError,
  DriveImportPendingError,
  type DriveImportService,
} from '../../../integrations/gdrive/conversion/drive-import.service';
import type { ConversionJobView } from '../../../integrations/gdrive/conversion/dto/conversion.dto';
import type { GDriveService } from '../../../integrations/gdrive/gdrive.service';
import type { GDriveRateLimiter } from '../../../integrations/gdrive/rate-limiter';
import { SigningOrderService } from '../../../signing/signing-order.service';
import { InMemoryStagedUploadsRepository } from '../../../uploads/__tests__/in-memory-staged-uploads.repository';
import {
  DriveSourceService,
  type DriveFileMetadata,
  type DriveFileMetadataFetcher,
} from '../../../uploads/drive-source.service';
import { StagedUploadsService } from '../../../uploads/staged-uploads.service';
import type { McpServices } from '../../mcp-services';
import { McpToolRunner } from '../../tool-runner';

/**
 * Write-tool harness (WP-19): the real envelope, document, signing-order,
 * idempotency and staged-upload services over the in-memory repositories
 * the e2e specs use, with Google Drive and the converter faked. A tool
 * spec therefore exercises the same service rules the HTTP routes do.
 */

export const OWNER = '00000000-0000-4000-8000-0000000000a1';
export const OTHER_OWNER = '00000000-0000-4000-8000-0000000000b2';
export const KEY_ID = '99999999-9999-4999-8999-999999999999';
export const ACCOUNT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const NOW = new Date('2026-10-02T12:00:00.000Z');

export const ALL_WRITE_SCOPES: readonly ApiKeyScope[] = [
  'envelopes:read',
  'envelopes:write',
  'documents:write',
  'gdrive:read',
];

const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: 0,
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_JWT_AUDIENCE: 'authenticated',
  CORS_ORIGIN: 'http://localhost:5173',
  APP_PUBLIC_URL: 'https://seald.test',
  DATABASE_URL: 'postgres://u:p@127.0.0.1:5432/db?sslmode=disable',
  STORAGE_BUCKET: 'envelopes',
  TC_VERSION: 'tc',
  PRIVACY_VERSION: 'pp',
  EMAIL_PROVIDER: 'logging',
  EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
  EMAIL_FROM_NAME: 'Seald',
  EMAIL_LEGAL_ENTITY: 'Seald',
  EMAIL_LEGAL_POSTAL: 'Postal address',
  EMAIL_PRIVACY_URL: 'https://seald.nromomentum.com/legal/privacy',
  EMAIL_PREFERENCES_URL: 'mailto:privacy@seald.nromomentum.com',
  PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
  WORKER_ENABLED: false,
  GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000',
  GDRIVE_CONVERSION_MAX_BYTES: 26_214_400,
} as AppEnv;

/** A real, parseable PDF with `pages` pages. */
export async function pdfBytes(pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([200, 200]);
  return Buffer.from(await doc.save());
}

/** A minimal .docx-shaped buffer (zip magic plus the main part name). */
export function docxBytes(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('....word/document.xml....', 'latin1'),
  ]);
}

export interface DriveFake {
  accounts: Array<{
    id: string;
    googleEmail: string;
    connectedAt: string;
    deletedAt: string | null;
  }>;
  files: Map<string, DriveFileMetadata>;
  /** `done` finishes inside the wait; `pending` times out; `failed` fails. */
  mode: 'done' | 'pending' | 'failed';
  jobs: Map<string, ConversionJobView>;
  listCalls: Array<Record<string, unknown>>;
}

export interface WriteWorld {
  readonly envelopesRepo: InMemoryEnvelopesRepository;
  readonly docsRepo: InMemoryEnvelopeDocumentsRepository;
  readonly contacts: InMemoryContactsRepository;
  readonly storage: InMemoryStorageService;
  readonly idempotencyRepo: InMemoryIdempotencyRecordsRepository;
  readonly uploadsRepo: InMemoryStagedUploadsRepository;
  readonly services: McpServices;
  readonly drive: DriveFake;
  gotenberg: 'ok' | 'fail';
}

export function writeWorld(): WriteWorld {
  const envelopesRepo = new InMemoryEnvelopesRepository();
  const docsRepo = new InMemoryEnvelopeDocumentsRepository(envelopesRepo);
  const contacts = new InMemoryContactsRepository();
  const storage = new InMemoryStorageService();
  const outbound = new InMemoryOutboundEmailsRepository();
  const idempotencyRepo = new InMemoryIdempotencyRecordsRepository();
  const uploadsRepo = new InMemoryStagedUploadsRepository();
  const drive: DriveFake = {
    accounts: [
      {
        id: ACCOUNT_ID,
        googleEmail: 'owner@gmail.test',
        connectedAt: '2026-09-01T00:00:00.000Z',
        deletedAt: null,
      },
    ],
    files: new Map(),
    mode: 'done',
    jobs: new Map(),
    listCalls: [],
  };

  const gdrive = {
    listAccounts: async () => drive.accounts,
    getTokenStatus: () => 'live' as const,
    getAccessToken: async () => ({ accessToken: 'drive-access', expiresAt: Date.now() + 3600_000 }),
    listFiles: async (_owner: string, accountId: string, mime: string, page: object) => {
      drive.listCalls.push({ accountId, mime, ...page });
      const q = (page as { nameContains?: string }).nameContains;
      const files = [...drive.files.values()]
        .filter((f) => q === undefined || f.name.toLowerCase().includes(q.toLowerCase()))
        .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, size: String(f.size ?? 1) }));
      return { files, nextPageToken: 'next-page' };
    },
  } as unknown as GDriveService;

  const world = { gotenberg: 'ok' } as { gotenberg: 'ok' | 'fail' };
  const imports = {
    importFile: async (args: {
      userId: string;
      fileId: string;
      onStarted?: (id: string) => Promise<void> | void;
    }) => {
      const jobId = randomUUID();
      if (args.onStarted) await args.onStarted(jobId);
      if (drive.mode === 'failed') throw new DriveImportError('conversion-failed');
      await storage.upload(
        `gdrive-conversions/${args.userId}/${jobId}.pdf`,
        await pdfBytes(2),
        'application/pdf',
      );
      if (drive.mode === 'pending') {
        drive.jobs.set(jobId, { jobId, status: 'converting' });
        throw new DriveImportPendingError(jobId);
      }
      drive.jobs.set(jobId, { jobId, status: 'done', assetUrl: 'https://x.test/a.pdf' });
      return { jobId, assetUrl: 'https://x.test/a.pdf' };
    },
    view: (jobId: string) => drive.jobs.get(jobId) ?? null,
    cancel: (jobId: string) => {
      const job = drive.jobs.get(jobId);
      if (!job || job.status === 'done') return false;
      drive.jobs.set(jobId, { jobId, status: 'cancelled' });
      return true;
    },
  } as unknown as DriveImportService;

  const fetchMetadata: DriveFileMetadataFetcher = async ({ fileId }) => {
    const file = drive.files.get(fileId);
    return file ? { status: 200, file } : { status: 404, file: null };
  };

  const envelopes = new EnvelopesService(
    envelopesRepo,
    contacts,
    storage,
    outbound,
    TEST_ENV,
    gdrive,
    {} as GdriveExportService,
    { findLatestByEnvelope: async () => null } as unknown as GdriveEnvelopeExportsRepository,
  );
  const documents = new EnvelopeDocumentsService(envelopesRepo, docsRepo, storage);
  const signingOrder = new SigningOrderService(envelopesRepo, outbound, TEST_ENV);
  const idempotency = new IdempotencyService(idempotencyRepo);
  const uploads = new StagedUploadsService(uploadsRepo, storage, envelopes, documents, async () =>
    world.gotenberg === 'ok'
      ? { ok: true, status: 200, body: await pdfBytes(3) }
      : { ok: false, status: 500, body: Buffer.alloc(0) },
  );
  const driveSource = new DriveSourceService(
    gdrive,
    imports,
    { acquire: async () => undefined } as unknown as GDriveRateLimiter,
    uploads,
    fetchMetadata,
    TEST_ENV,
  );
  const services = {
    envelopes,
    documents,
    queries: {},
    accounts: {},
    signingOrder,
    idempotency,
    uploads,
    drive: driveSource,
  } as unknown as McpServices;

  return Object.assign(world, {
    envelopesRepo,
    docsRepo,
    contacts,
    storage,
    idempotencyRepo,
    uploadsRepo,
    services,
    drive,
  });
}

export function principalFor(
  scopes: readonly ApiKeyScope[] = ALL_WRITE_SCOPES,
  ownerId = OWNER,
  keyId = KEY_ID,
): ApiKeyPrincipal {
  return {
    ok: true,
    ownerId,
    keyId,
    scopes,
    keyName: 'Key 1',
    keyPrefix: 'prefix_abcdefgh',
    requireOwnerApproval: true,
    allowNewRecipients: false,
    alwaysRequireSignin: false,
  };
}

export async function callWrite(
  w: WriteWorld,
  name: string,
  args: Record<string, unknown>,
  opts: { scopes?: readonly ApiKeyScope[]; owner?: string; keyId?: string } = {},
): Promise<CallToolResult> {
  const runner = new McpToolRunner(w.services);
  return runner.call(
    name,
    args,
    principalFor(opts.scopes ?? ALL_WRITE_SCOPES, opts.owner ?? OWNER, opts.keyId ?? KEY_ID),
    NOW,
  );
}

let keySeq = 0;
/** A fresh idempotency key and `dry_run: false`. */
export function write(extra: Record<string, unknown> = {}): Record<string, unknown> {
  keySeq += 1;
  return {
    idempotency_key: `test-key-${String(keySeq).padStart(6, '0')}`,
    dry_run: false,
    ...extra,
  };
}

export function ok(result: CallToolResult): Record<string, unknown> {
  if (result.isError) {
    const first = result.content[0];
    throw new Error(`tool error: ${first && first.type === 'text' ? first.text : '?'}`);
  }
  return result.structuredContent as Record<string, unknown>;
}

export function err(result: CallToolResult): { slug: string; url?: string; next_steps: unknown[] } {
  expect(result.isError).toBe(true);
  const first = result.content[0];
  if (!first || first.type !== 'text') throw new Error('no text content');
  return JSON.parse(first.text) as { slug: string; url?: string; next_steps: unknown[] };
}

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

/** Every flag on, then `overrides`, until {@link resetFlags}. */
export function setFlags(overrides: Partial<Record<FeatureFlag, boolean>> = {}): void {
  const all = Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, true]));
  host.__SEALD_FEATURE_OVERRIDES__ = { ...all, ...overrides };
}

export function resetFlags(): void {
  delete host.__SEALD_FEATURE_OVERRIDES__;
}

/** Run `fn` with every flag on, then `overrides`. */
export async function withFlags<T>(
  overrides: Partial<Record<FeatureFlag, boolean>>,
  fn: () => Promise<T>,
): Promise<T> {
  const all = Object.fromEntries(Object.keys(FEATURE_FLAGS).map((k) => [k, true]));
  host.__SEALD_FEATURE_OVERRIDES__ = { ...all, ...overrides };
  try {
    return await fn();
  } finally {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  }
}

/** Move a draft out of `draft`, as a send would. */
export function markSent(w: WriteWorld, id: string): void {
  const env = w.envelopesRepo.envelopes.get(id);
  if (!env) throw new Error('no such envelope');
  w.envelopesRepo.envelopes.set(id, {
    ...env,
    status: 'awaiting_others',
    sent_at: NOW.toISOString(),
  });
}

/** Create a draft through the tool and return its id. */
export async function draft(w: WriteWorld, title = 'NDA', owner = OWNER): Promise<string> {
  const out = ok(await callWrite(w, 'envelopes_create', write({ title }), { owner }));
  return out['id'] as string;
}

/** Stage a PDF through `documents_upload` and return its document_id. */
export async function staged(w: WriteWorld, pages = 1, filename = 'contract.pdf'): Promise<string> {
  const content_base64 = (await pdfBytes(pages)).toString('base64');
  const out = ok(await callWrite(w, 'documents_upload', write({ content_base64, filename })));
  return out['document_id'] as string;
}
