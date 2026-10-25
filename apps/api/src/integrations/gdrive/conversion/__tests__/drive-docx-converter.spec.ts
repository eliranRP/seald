import { makeDriveDocxConverter, sourceMimeFor } from '../drive-docx-converter';
import { selectWordConverter } from '../conversion.module';

type Call = { url: string; init: RequestInit | undefined };

function fakeFetch(routes: Array<(url: string, init?: RequestInit) => Response | undefined>): {
  fetch: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    for (const r of routes) {
      const res = r(url, init);
      if (res) return res;
    }
    throw new Error(`unexpected ${url}`);
  }) as typeof fetch;
  return { fetch: impl, calls };
}

const creds = { clientId: 'cid', clientSecret: 'csecret', refreshToken: 'rtoken' };
const PDF = Buffer.from('%PDF-1.7 fake');

const token = (url: string) =>
  url.startsWith('https://oauth2.googleapis.com/token')
    ? new Response(JSON.stringify({ access_token: 'at', expires_in: 3600 }), { status: 200 })
    : undefined;
const upload =
  (status = 200) =>
  (url: string) =>
    url.startsWith('https://www.googleapis.com/upload/drive/v3/files')
      ? new Response(status === 200 ? JSON.stringify({ id: 'doc1' }) : 'err', { status })
      : undefined;
const exportPdf =
  (status = 200) =>
  (url: string) =>
    url.includes('/files/doc1/export')
      ? new Response(status === 200 ? new Uint8Array(PDF) : 'err', { status })
      : undefined;
const del = (url: string, init?: RequestInit) =>
  url.endsWith('/files/doc1') && init?.method === 'DELETE'
    ? new Response(null, { status: 204 })
    : undefined;

describe('makeDriveDocxConverter', () => {
  it('uploads as a Google Doc, exports PDF, then deletes the temp file', async () => {
    const f = fakeFetch([token, upload(), exportPdf(), del]);
    const convert = makeDriveDocxConverter(creds, f.fetch);
    const res = await convert({ fileBytes: Buffer.from('PK docx'), filename: 'a.docx' });

    expect(res).toEqual({ ok: true, status: 200, body: PDF });
    expect(f.calls.map((c) => c.init?.method ?? 'GET')).toEqual(['POST', 'POST', 'GET', 'DELETE']);
    const tokenBody = String(f.calls[0]!.init!.body);
    expect(tokenBody).toContain('grant_type=refresh_token');
    expect(tokenBody).toContain('refresh_token=rtoken');
    const up = f.calls[1]!;
    expect((up.init!.headers as Record<string, string>).authorization).toBe('Bearer at');
    const upBody = Buffer.from(up.init!.body as Uint8Array).toString();
    expect(upBody).toContain('"mimeType":"application/vnd.google-apps.document"');
    expect(upBody).toContain('wordprocessingml.document');
    expect(upBody).toContain('PK docx');
  });

  it('caches the access token across calls', async () => {
    const f = fakeFetch([token, upload(), exportPdf(), del]);
    const convert = makeDriveDocxConverter(creds, f.fetch);
    await convert({ fileBytes: Buffer.from('x'), filename: 'a.docx' });
    await convert({ fileBytes: Buffer.from('y'), filename: 'b.docx' });
    expect(f.calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
  });

  it('returns ok:false when the refresh token is rejected, and does not cache', async () => {
    const bad = (url: string) =>
      url.includes('oauth2')
        ? new Response('{"error":"invalid_grant"}', { status: 400 })
        : undefined;
    const f = fakeFetch([bad]);
    const convert = makeDriveDocxConverter(creds, f.fetch);
    const res = await convert({ fileBytes: Buffer.from('x'), filename: 'a.docx' });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    await convert({ fileBytes: Buffer.from('x'), filename: 'a.docx' });
    expect(f.calls.length).toBe(2);
  });

  it('returns ok:false on upload failure without calling export', async () => {
    const f = fakeFetch([token, upload(403)]);
    const res = await makeDriveDocxConverter(
      creds,
      f.fetch,
    )({
      fileBytes: Buffer.from('x'),
      filename: 'a.docx',
    });
    expect(res).toMatchObject({ ok: false, status: 403 });
    expect(f.calls.some((c) => c.url.includes('/export'))).toBe(false);
  });

  it('still deletes the temp Doc when export fails', async () => {
    const f = fakeFetch([token, upload(), exportPdf(500), del]);
    const res = await makeDriveDocxConverter(
      creds,
      f.fetch,
    )({
      fileBytes: Buffer.from('x'),
      filename: 'a.docx',
    });
    expect(res).toMatchObject({ ok: false, status: 500 });
    expect(res.body.length).toBe(0);
    expect(f.calls.at(-1)!.init?.method).toBe('DELETE');
  });

  it('propagates an abort so callers can map it to conversion_timeout', async () => {
    const abortErr = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    const f = fakeFetch([
      token,
      (url) => {
        if (url.includes('/upload/')) throw abortErr;
        return undefined;
      },
    ]);
    await expect(
      makeDriveDocxConverter(creds, f.fetch)({ fileBytes: Buffer.from('x'), filename: 'a.docx' }),
    ).rejects.toBe(abortErr);
  });

  it('maps .doc to application/msword', () => {
    expect(sourceMimeFor('upload.doc')).toBe('application/msword');
    expect(sourceMimeFor('upload.docx')).toContain('wordprocessingml');
  });
});

describe('selectWordConverter', () => {
  const base = { GDRIVE_GOTENBERG_URL: 'http://gotenberg:3000' };

  it('uses Gotenberg when the converter account is not configured', async () => {
    const f = fakeFetch([
      (url) => (url.includes('gotenberg') ? new Response(new Uint8Array(PDF)) : undefined),
    ]);
    const c = selectWordConverter(
      { ...base, GDRIVE_OAUTH_CLIENT_ID: 'cid', GDRIVE_OAUTH_CLIENT_SECRET: 's' },
      f.fetch,
    );
    await c({ fileBytes: Buffer.from('x'), filename: 'a.docx' });
    expect(f.calls[0]!.url).toBe('http://gotenberg:3000/forms/libreoffice/convert');
  });

  it('uses the Drive API when refresh token and OAuth client are set', async () => {
    const f = fakeFetch([token, upload(), exportPdf(), del]);
    const c = selectWordConverter(
      {
        ...base,
        GDRIVE_CONVERTER_REFRESH_TOKEN: 'r',
        GDRIVE_OAUTH_CLIENT_ID: 'cid',
        GDRIVE_OAUTH_CLIENT_SECRET: 's',
      },
      f.fetch,
    );
    await c({ fileBytes: Buffer.from('x'), filename: 'a.docx' });
    expect(f.calls[0]!.url).toContain('oauth2.googleapis.com');
    expect(f.calls.some((x) => x.url.includes('gotenberg'))).toBe(false);
  });
});
