export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

export type DriveMimeFilter = 'pdf' | 'doc' | 'docx' | 'all';

export const SUPPORTED_MIME_FILTERS: ReadonlySet<DriveMimeFilter> = new Set([
  'pdf',
  'doc',
  'docx',
  'all',
]);

export const GDRIVE_FILES_PROXY = Symbol('GDRIVE_FILES_PROXY');

// Type contract for the files-proxy implementation (Drive `files.list`).
export type FilesProxy = (args: {
  accessToken: string;
  mimeFilter: DriveMimeFilter;
  /** Name substring (Drive `name contains`). MCP `gdrive_search_files`. */
  nameContains?: string;
  /** 1–50; default 50. */
  pageSize?: number;
  /** Drive `nextPageToken` from the previous page. */
  pageToken?: string;
}) => Promise<{ files: ReadonlyArray<DriveFile>; nextPageToken?: string }>;

/** Drive query string literal: backslash and single quote escaped. */
export function driveQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

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
  return async ({
    accessToken,
    mimeFilter,
    nameContains,
    pageSize,
    pageToken,
  }): Promise<{ files: ReadonlyArray<DriveFile>; nextPageToken?: string }> => {
    // The paging and name options are MCP-only (WP-19). Without them the
    // request is byte-for-byte the SPA's.
    const paged = nameContains !== undefined || pageSize !== undefined || pageToken !== undefined;
    const name =
      nameContains !== undefined ? ` and name contains ${driveQueryLiteral(nameContains)}` : '';
    const params = new URLSearchParams({
      pageSize: String(pageSize ?? 50),
      fields: paged
        ? 'nextPageToken,files(id,name,mimeType,modifiedTime,size)'
        : 'files(id,name,mimeType,modifiedTime,size)',
      q: `${MIME_FILTERS[mimeFilter]} and trashed = false${name}`,
    });
    if (pageToken !== undefined) params.set('pageToken', pageToken);
    const res = await fetchImpl(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      throw new Error(`drive_files_list_failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      files?: ReadonlyArray<DriveFile>;
      nextPageToken?: string;
    };
    if (paged && typeof json.nextPageToken === 'string') {
      return { files: json.files ?? [], nextPageToken: json.nextPageToken };
    }
    return { files: json.files ?? [] };
  };
}
