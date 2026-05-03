import type { DriveFetcher, GotenbergClient } from './conversion.service';

/**
 * Production binding for {@link DriveFetcher}. Reads the body into a
 * Buffer (Drive responses for our 25 MB cap fit comfortably; a streaming
 * variant is not needed for v1). The bearer token is sent via the
 * Authorization header — never logged.
 */
export function makeDriveFetcher(fetchImpl: typeof fetch = fetch): DriveFetcher {
  return async ({ url, accessToken, signal }) => {
    const init: RequestInit = {
      headers: { authorization: `Bearer ${accessToken}` },
    };
    if (signal) init.signal = signal;
    const res = await fetchImpl(url, init);
    const ab = await res.arrayBuffer();
    const body = Buffer.from(ab);
    const cl = Number(res.headers.get('content-length') ?? body.length);
    return { ok: res.ok, status: res.status, body, contentLength: cl };
  };
}

/**
 * Production binding for {@link GotenbergClient}. Posts the .docx bytes
 * to Gotenberg's LibreOffice-backed conversion endpoint as multipart.
 * The sidecar URL is read from `GDRIVE_GOTENBERG_URL` and defaults to
 * `http://gotenberg:3000` (the docker-compose service name).
 *
 * Why no `formidable`/`form-data` dep? Node 18+ ships native
 * `FormData` + `Blob`; using them keeps the LOC budget down and avoids
 * an extra dep audit.
 */
export function makeGotenbergClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): GotenbergClient {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/forms/libreoffice/convert`;
  return async ({ fileBytes, filename, signal }) => {
    const fd = new FormData();
    // The Gotenberg LibreOffice route accepts the file under the literal
    // field name `files` — see https://gotenberg.dev/docs/routes#libreoffice.
    fd.append(
      'files',
      new Blob([new Uint8Array(fileBytes)], {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      }),
      filename,
    );
    const init: RequestInit = { method: 'POST', body: fd };
    if (signal) init.signal = signal;
    const res = await fetchImpl(endpoint, init);
    const ab = await res.arrayBuffer();
    return { ok: res.ok, status: res.status, body: Buffer.from(ab) };
  };
}
