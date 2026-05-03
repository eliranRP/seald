import type { DriveFile, FilesProxy } from './gdrive.controller';

const MIME_FILTERS: Record<'pdf' | 'doc' | 'docx' | 'all', string> = {
  pdf: "mimeType='application/pdf'",
  doc: "mimeType='application/vnd.google-apps.document'",
  docx: "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
  all: "(mimeType='application/pdf' or mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document')",
};

/**
 * Server-side proxy over Drive `files.list`. Why a proxy and not a
 * client-side call? Three reasons:
 *  1. Access tokens never leave the API — the SPA only sees JSON file
 *     metadata, not bearer tokens (red-flag row 3 spirit).
 *  2. We can mime-filter at the source so the SPA can't cheat past the
 *     allow-list (defence in depth — picker also filters client-side).
 *  3. Per-user rate limiting (red-flag row 13) is enforced at the proxy.
 *
 * Phase 5 watchpoint #1 — this proxy MUST live in WT-A. It is not a
 * frontend concern.
 */
export function makeFilesProxy(fetchImpl: typeof fetch = fetch): FilesProxy {
  return async ({ accessToken, mimeFilter }): Promise<{ files: ReadonlyArray<DriveFile> }> => {
    const params = new URLSearchParams({
      pageSize: '50',
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      q: `${MIME_FILTERS[mimeFilter]} and trashed = false`,
    });
    const res = await fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`drive_files_list_failed: ${res.status}`);
    }
    const json = (await res.json()) as { files?: ReadonlyArray<DriveFile> };
    return { files: json.files ?? [] };
  };
}
