/**
 * Decisions shared by the browser Drive import hook and
 * `DriveImportService`. The hook still owns React state and `File`;
 * the service still owns the conversion job. Both ask this module
 * what a job view means and what to name the PDF.
 */

export const DRIVE_IMPORT_ERROR_CODES = [
  'token-expired',
  'oauth-declined',
  'no-files-match-filter',
  'conversion-failed',
  'file-too-large',
  'unsupported-mime',
  'rate-limited',
  'cancelled',
  'import-failed',
] as const;

export type DriveImportErrorCode = (typeof DRIVE_IMPORT_ERROR_CODES)[number];

const KNOWN: ReadonlySet<string> = new Set(DRIVE_IMPORT_ERROR_CODES);

export function driveImportErrorCode(candidate: string | undefined): DriveImportErrorCode {
  if (candidate !== undefined && candidate.length > 0 && KNOWN.has(candidate)) {
    return candidate as DriveImportErrorCode;
  }
  if (candidate === undefined || candidate.length === 0) return 'conversion-failed';
  return 'import-failed';
}

export function pdfFileNameForDriveImport(name: string): string {
  if (name.toLowerCase().endsWith('.pdf')) return name;
  return `${name}.pdf`;
}

export type DriveImportStep =
  | { readonly kind: 'pending' }
  | { readonly kind: 'done'; readonly assetUrl: string }
  | { readonly kind: 'failed'; readonly errorCode: DriveImportErrorCode }
  | { readonly kind: 'cancelled' };

/**
 * Same branches the import hook used: `done` without an asset URL
 * keeps polling. `failed` uses the view's code. A missing code is
 * `conversion-failed`. Any other string is `import-failed`.
 */
export function driveImportStep(view: {
  readonly status: string;
  readonly assetUrl?: string;
  readonly errorCode?: string;
}): DriveImportStep {
  if (view.status === 'done' && view.assetUrl) {
    return { kind: 'done', assetUrl: view.assetUrl };
  }
  if (view.status === 'failed') {
    return { kind: 'failed', errorCode: driveImportErrorCode(view.errorCode) };
  }
  if (view.status === 'cancelled') return { kind: 'cancelled' };
  return { kind: 'pending' };
}
