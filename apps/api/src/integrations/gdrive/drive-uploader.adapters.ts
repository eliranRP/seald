import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  TokenExpiredError,
} from './dto/error-codes';
import { RateLimitedError } from './rate-limiter';
import {
  DriveFileNotFoundError,
  type DriveUploadedFile,
  type DriveUploader,
} from './drive-uploader';

const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const FIELDS = 'id,name,webViewLink';
const PDF_MIME = 'application/pdf';
// Multipart boundary — must not appear in either part. The metadata part
// is JSON we control; the PDF part is binary, so a long random ASCII
// token is collision-safe in practice.
const BOUNDARY = 'seald-gdrive-export-boundary-7c1f3a2b9d4e';

function mapNonOk(operation: string, status: number): never {
  if (status === 401) throw new TokenExpiredError(`drive_${operation}_401`);
  if (status === 403) throw new DrivePermissionDeniedError(`drive_${operation}_403`);
  if (status === 404) throw new DriveFileNotFoundError(`drive_${operation}_404`);
  // 429 + 5xx + anything else → opaque upstream. The rate-limit case is
  // kept distinct so callers can surface Retry-After; Drive's 429 body
  // omits a usable retry hint, so we use a fixed short backoff.
  if (status === 429) throw new RateLimitedError(30_000);
  throw new DriveUpstreamError(`drive_${operation}_${status}`);
}

async function parseUploaded(res: Response, operation: string): Promise<DriveUploadedFile> {
  let json: { id?: unknown; name?: unknown; webViewLink?: unknown };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    throw new DriveUpstreamError(`drive_${operation}_bad_json`);
  }
  if (typeof json.id !== 'string' || json.id.length === 0) {
    throw new DriveUpstreamError(`drive_${operation}_missing_id`);
  }
  const name = typeof json.name === 'string' ? json.name : '';
  const webViewLink =
    typeof json.webViewLink === 'string' && json.webViewLink.length > 0
      ? json.webViewLink
      : `https://drive.google.com/file/d/${json.id}/view`;
  return { id: json.id, name, webViewLink };
}

/**
 * Production binding for {@link DriveUploader}. Uses native `fetch` and
 * hand-builds the `multipart/related` body for `files.create` (one JSON
 * metadata part + one binary PDF part); `files.update` is a plain
 * `uploadType=media` PATCH of the raw bytes.
 */
export function makeDriveUploader(fetchImpl: typeof fetch = fetch): DriveUploader {
  return {
    async create({ accessToken, metadata, bytes, signal }): Promise<DriveUploadedFile> {
      const url = `${UPLOAD_BASE}?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`;
      const metaJson = JSON.stringify({
        name: metadata.name,
        parents: metadata.parents,
        mimeType: metadata.mimeType,
      });
      const head =
        `--${BOUNDARY}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${metaJson}\r\n` +
        `--${BOUNDARY}\r\n` +
        `Content-Type: ${PDF_MIME}\r\n\r\n`;
      const tail = `\r\n--${BOUNDARY}--\r\n`;
      const body = Buffer.concat([Buffer.from(head, 'utf8'), bytes, Buffer.from(tail, 'utf8')]);
      const init: RequestInit = {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': `multipart/related; boundary=${BOUNDARY}`,
        },
        body: new Uint8Array(body),
      };
      if (signal) init.signal = signal;
      let res: Response;
      try {
        res = await fetchImpl(url, init);
      } catch (err) {
        throw new DriveUpstreamError(`drive_create_transport: ${(err as Error).message}`);
      }
      if (!res.ok) mapNonOk('create', res.status);
      return parseUploaded(res, 'create');
    },

    async update({ accessToken, fileId, bytes, signal }): Promise<DriveUploadedFile> {
      const url = `${UPLOAD_BASE}/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=${encodeURIComponent(FIELDS)}`;
      const init: RequestInit = {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': PDF_MIME,
        },
        body: new Uint8Array(bytes),
      };
      if (signal) init.signal = signal;
      let res: Response;
      try {
        res = await fetchImpl(url, init);
      } catch (err) {
        throw new DriveUpstreamError(`drive_update_transport: ${(err as Error).message}`);
      }
      if (!res.ok) mapNonOk('update', res.status);
      return parseUploaded(res, 'update');
    },
  };
}
