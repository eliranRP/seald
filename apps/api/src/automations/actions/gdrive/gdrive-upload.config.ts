/**
 * Config + naming for the `gdrive_upload` action (recipe `sealed_save_drive`,
 * A6). The recipe stores `{ folder_id, folder_name, account_id }`; all three
 * may be null on a fresh recipe: the first run creates "My Drive / Seald"
 * and remembers its id. Scope stays `drive.file` only.
 */
export const DEFAULT_DRIVE_FOLDER_LEAF = 'Seald';
export const DEFAULT_DRIVE_FOLDER_LABEL = 'My Drive / Seald';
/** Drive's alias for the root of My Drive. */
export const DRIVE_ROOT_ID = 'root';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Drive ids are URL-safe base64-ish; refuse anything else before it reaches a query. */
const DRIVE_ID_RE = /^[A-Za-z0-9_-]{5,128}$/;

export interface GdriveUploadConfig {
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly accountId: string | null;
}

export type ParsedGdriveUploadConfig =
  | ({ readonly ok: true } & GdriveUploadConfig)
  | { readonly ok: false; readonly slug: 'bad_config' };

export function parseGdriveUploadConfig(raw: Record<string, unknown>): ParsedGdriveUploadConfig {
  const folderId = raw['folder_id'] ?? null;
  const folderName = raw['folder_name'] ?? null;
  const accountId = raw['account_id'] ?? null;
  if (folderId !== null && (typeof folderId !== 'string' || !DRIVE_ID_RE.test(folderId))) {
    return { ok: false, slug: 'bad_config' };
  }
  if (folderName !== null && (typeof folderName !== 'string' || folderName.length > 200)) {
    return { ok: false, slug: 'bad_config' };
  }
  if (accountId !== null && (typeof accountId !== 'string' || !UUID_RE.test(accountId))) {
    return { ok: false, slug: 'bad_config' };
  }
  return { ok: true, folderId, folderName, accountId };
}

/** Same cleaning as the manual "Save to Google Drive" names. */
export function sanitizeFileBase(title: string): string {
  const cleaned = title
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .trim();
  return cleaned.length > 0 ? cleaned : 'Envelope';
}

export interface UploadPlanItem {
  readonly kind: 'sealed' | 'audit';
  readonly path: string;
  /** Deterministic: the same envelope always yields the same name. */
  readonly name: string;
}

export interface UploadPlanInput {
  readonly envelopeId: string;
  readonly title: string;
  readonly documents: ReadonlyArray<{
    readonly ord: number;
    readonly title: string;
    readonly sealedPath: string;
  }>;
  readonly auditPath: string;
}

/**
 * One item per sealed document (in `ord` order) plus `audit.pdf`. Names
 * carry a short envelope id (and the document slot when there are several),
 * so a retry finds the file it already wrote by name and never uploads a
 * duplicate, and two envelopes with the same title never overwrite each
 * other.
 */
export function buildUploadPlan(input: UploadPlanInput): ReadonlyArray<UploadPlanItem> {
  const base = sanitizeFileBase(input.title);
  const tag = input.envelopeId.replace(/-/g, '').slice(0, 8);
  const multi = input.documents.length > 1;
  const sealed = input.documents.map(
    (doc): UploadPlanItem => ({
      kind: 'sealed',
      path: doc.sealedPath,
      name: multi
        ? `${base} - ${sanitizeFileBase(doc.title)} (sealed) [${tag}-${doc.ord}].pdf`
        : `${base} (sealed) [${tag}].pdf`,
    }),
  );
  return [
    ...sealed,
    { kind: 'audit', path: input.auditPath, name: `${base} (audit trail) [${tag}].pdf` },
  ];
}
