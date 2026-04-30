import { apiClient } from '@/lib/api/apiClient';

/**
 * Account-level (per-user) API calls — DSAR export and right-to-erasure.
 *
 * Both endpoints sit behind the global `AuthGuard` and are tightly
 * throttled: export is heavy (hydrates every owner_id row) and delete
 * is irreversible.
 */

/**
 * Download `GET /me/export` as a Blob and return it together with the
 * `Content-Disposition` filename suggested by the API. The caller is
 * expected to drive the actual save-to-disk via an anchor click; we keep
 * that out of the API layer so unit tests don't need to fake DOM.
 */
export async function exportAccount(): Promise<{
  readonly blob: Blob;
  readonly filename: string;
}> {
  const res = await apiClient.get<Blob>('/me/export', {
    // Axios defaults to `transformResponse: JSON.parse`, which would
    // happily double-encode our pretty-printed JSON. Asking for a Blob
    // bypasses that and lets us hand the bytes straight to the user.
    responseType: 'blob',
  });
  const cd = (res.headers['content-disposition'] ?? res.headers['Content-Disposition']) as
    | string
    | undefined;
  const filename = parseContentDispositionFilename(cd) ?? defaultFilename();
  return { blob: res.data, filename };
}

/**
 * Permanently delete the caller's account and every owner_id row. The
 * confirm phrase is server-validated against the literal
 * `'DELETE_MY_ACCOUNT'` — see `apps/api/src/me/dto/delete-account.dto.ts`.
 * Returns void on success; the API answers 204 No Content.
 */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete('/me', {
    data: { confirm: 'DELETE_MY_ACCOUNT' },
  });
}

function parseContentDispositionFilename(value: string | undefined): string | null {
  if (!value) return null;
  // Both `filename="x.json"` and `filename*=UTF-8''x.json` are tolerated
  // here, in that order. We don't need RFC 6266 strictness — the API only
  // ever sends the simple ASCII form, but we still cope if it's switched
  // up later.
  const star = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (star && star[1]) return decodeURIComponent(star[1].trim());
  const plain = /filename="([^"]+)"/i.exec(value);
  if (plain && plain[1]) return plain[1];
  return null;
}

function defaultFilename(): string {
  // Stable fallback so we never download a literal `Blob` with no name if
  // the API forgets the header.
  return `seald-export-${new Date().toISOString().slice(0, 10)}.json`;
}
