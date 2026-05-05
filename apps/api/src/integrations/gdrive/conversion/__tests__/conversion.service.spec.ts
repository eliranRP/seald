/**
 * Unit tests for ConversionService — the WT-D core that turns a Drive
 * file into a PDF buffer through three branches:
 *   - PDF passthrough → Drive `files.get(alt=media)`
 *   - Google Doc → Drive `files.export(application/pdf)`
 *   - .docx → Gotenberg `/forms/libreoffice/convert`
 *
 * Tests pin the wire shape of each branch + the security guards
 * (size cap, mime allow-list, AbortSignal propagation, no token leak).
 */

import { ConversionGateway } from '../conversion.gateway';
import { ConversionService, type DriveFetcher, type GotenbergClient } from '../conversion.service';

interface FetcherCall {
  readonly url: string;
  readonly accessToken: string;
  readonly signal?: AbortSignal | undefined;
}

function fakeDriveFetcher(
  responder: (call: FetcherCall) => {
    ok: boolean;
    status: number;
    body: Buffer;
    contentLength?: number;
  },
): { fetcher: DriveFetcher; calls: FetcherCall[] } {
  const calls: FetcherCall[] = [];
  const fetcher: DriveFetcher = async ({ url, accessToken, signal }) => {
    calls.push({ url, accessToken, ...(signal !== undefined ? { signal } : {}) });
    const out = responder({ url, accessToken, ...(signal !== undefined ? { signal } : {}) });
    return {
      ok: out.ok,
      status: out.status,
      body: out.body,
      contentLength: out.contentLength ?? out.body.length,
    };
  };
  return { fetcher, calls };
}

interface GotenbergCall {
  readonly fileBytes: Buffer;
  readonly filename: string;
  readonly signal?: AbortSignal | undefined;
}

function fakeGotenberg(
  responder: (call: GotenbergCall) => { ok: boolean; status: number; body: Buffer },
): { client: GotenbergClient; calls: GotenbergCall[] } {
  const calls: GotenbergCall[] = [];
  const client: GotenbergClient = async ({ fileBytes, filename, signal }) => {
    calls.push({ fileBytes, filename, ...(signal !== undefined ? { signal } : {}) });
    const out = responder({ fileBytes, filename, ...(signal !== undefined ? { signal } : {}) });
    return { ok: out.ok, status: out.status, body: out.body };
  };
  return { client, calls };
}

describe('ConversionService', () => {
  const PDF_BYTES = Buffer.from('%PDF-1.7\n...');
  const DOCX_BYTES = Buffer.from('PK\x03\x04docx-bytes');
  const MAX_BYTES = 25 * 1024 * 1024;

  it('PDF passthrough: calls Drive files.get(alt=media), returns bytes unmodified', async () => {
    const { fetcher, calls } = fakeDriveFetcher(() => ({
      ok: true,
      status: 200,
      body: PDF_BYTES,
    }));
    const { client: gotenberg, calls: gotenbergCalls } = fakeGotenberg(() => ({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    const out = await svc.convertOnce({
      accessToken: 'at-1',
      fileId: 'file-1',
      mimeType: 'application/pdf',
    });

    expect(out.bytes.equals(PDF_BYTES)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/files/file-1');
    expect(calls[0]?.url).toContain('alt=media');
    expect(calls[0]?.accessToken).toBe('at-1');
    expect(gotenbergCalls).toHaveLength(0);
  });

  it('Doc path: calls Drive files.export(application/pdf), returns bytes', async () => {
    const { fetcher, calls } = fakeDriveFetcher(() => ({
      ok: true,
      status: 200,
      body: PDF_BYTES,
    }));
    const { client: gotenberg, calls: gotenbergCalls } = fakeGotenberg(() => ({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    const out = await svc.convertOnce({
      accessToken: 'at-2',
      fileId: 'doc-1',
      mimeType: 'application/vnd.google-apps.document',
    });

    expect(out.bytes.equals(PDF_BYTES)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toContain('/files/doc-1/export');
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain('mimeType=application/pdf');
    expect(gotenbergCalls).toHaveLength(0);
  });

  it('docx path: downloads bytes from Drive then posts to Gotenberg, returns the converted PDF', async () => {
    const driveResp = (call: FetcherCall): { ok: boolean; status: number; body: Buffer } => {
      // First call = Drive download
      expect(call.url).toContain('/files/docx-1');
      expect(call.url).toContain('alt=media');
      return { ok: true, status: 200, body: DOCX_BYTES };
    };
    const { fetcher, calls } = fakeDriveFetcher(driveResp);
    const { client: gotenberg, calls: gotenbergCalls } = fakeGotenberg(() => ({
      ok: true,
      status: 200,
      body: PDF_BYTES,
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    const out = await svc.convertOnce({
      accessToken: 'at-3',
      fileId: 'docx-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    expect(out.bytes.equals(PDF_BYTES)).toBe(true);
    expect(calls).toHaveLength(1);
    expect(gotenbergCalls).toHaveLength(1);
    expect(gotenbergCalls[0]?.fileBytes.equals(DOCX_BYTES)).toBe(true);
    expect(gotenbergCalls[0]?.filename).toMatch(/\.docx$/);
  });

  it('rejects with file-too-large when the Drive content-length exceeds the cap', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({
      ok: true,
      status: 200,
      body: Buffer.alloc(0),
      // Pretend it's bigger than max — the service must reject before pulling the body.
      contentLength: MAX_BYTES + 1,
    }));
    const { client: gotenberg, calls: gotenbergCalls } = fakeGotenberg(() => ({
      ok: true,
      status: 200,
      body: PDF_BYTES,
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    await expect(
      svc.convertOnce({
        accessToken: 'at',
        fileId: 'huge',
        mimeType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'file-too-large' });

    // Defence in depth: even if we got the body, Gotenberg must not be called.
    expect(gotenbergCalls).toHaveLength(0);
  });

  it('rejects with file-too-large when the actual body exceeds the cap (defence in depth)', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({
      ok: true,
      status: 200,
      body: Buffer.alloc(MAX_BYTES + 1, 0x41),
      // Force content-length to lie about the real size.
      contentLength: 100,
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: fakeGotenberg(() => ({ ok: true, status: 200, body: PDF_BYTES })).client,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });
    await expect(
      svc.convertOnce({ accessToken: 'at', fileId: 'huge', mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'file-too-large' });
  });

  it('rejects with unsupported-mime for any mime not in the allow-list', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({ ok: true, status: 200, body: PDF_BYTES }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: fakeGotenberg(() => ({ ok: true, status: 200, body: PDF_BYTES })).client,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });
    await expect(
      svc.convertOnce({ accessToken: 'at', fileId: 'x', mimeType: 'image/png' }),
    ).rejects.toMatchObject({ code: 'unsupported-mime' });
  });

  it('Gotenberg 5xx → conversion-failed (no upstream body echoed)', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({ ok: true, status: 200, body: DOCX_BYTES }));
    const { client: gotenberg } = fakeGotenberg(() => ({
      ok: false,
      status: 503,
      body: Buffer.from('libreoffice crashed: secret-token-12345'),
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    const err = await svc
      .convertOnce({
        accessToken: 'at',
        fileId: 'docx-x',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'conversion-failed' });
    // The error message must NOT carry the upstream body or the access token.
    expect(JSON.stringify(err)).not.toContain('secret-token-12345');
    expect(JSON.stringify(err)).not.toContain('libreoffice crashed');
  });

  it('Drive 401 (token expired) on download → token-expired code', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({
      ok: false,
      status: 401,
      body: Buffer.from('unauth'),
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: fakeGotenberg(() => ({ ok: true, status: 200, body: PDF_BYTES })).client,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });
    await expect(
      svc.convertOnce({ accessToken: 'at', fileId: 'x', mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({ code: 'token-expired' });
  });

  it('Drive 403 (consent revoked) on download → oauth-declined code', async () => {
    const { fetcher } = fakeDriveFetcher(() => ({
      ok: false,
      status: 403,
      body: Buffer.from('forbidden'),
    }));
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: fakeGotenberg(() => ({ ok: true, status: 200, body: PDF_BYTES })).client,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });
    await expect(
      svc.convertOnce({
        accessToken: 'at',
        fileId: 'x',
        mimeType: 'application/vnd.google-apps.document',
      }),
    ).rejects.toMatchObject({ code: 'oauth-declined' });
  });

  it('AbortSignal propagates from caller into both Drive and Gotenberg calls', async () => {
    let driveSignal: AbortSignal | undefined;
    let gotenbergSignal: AbortSignal | undefined;
    const { fetcher } = fakeDriveFetcher(({ signal }) => {
      driveSignal = signal;
      return { ok: true, status: 200, body: DOCX_BYTES };
    });
    const { client: gotenberg } = fakeGotenberg(({ signal }) => {
      gotenbergSignal = signal;
      return { ok: true, status: 200, body: PDF_BYTES };
    });
    const svc = new ConversionService({
      driveFetcher: fetcher,
      gotenbergClient: gotenberg,
      gateway: new ConversionGateway(),
      maxBytes: MAX_BYTES,
    });

    const ctrl = new AbortController();
    await svc.convertOnce({
      accessToken: 'at',
      fileId: 'docx-1',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      signal: ctrl.signal,
    });
    expect(driveSignal).toBe(ctrl.signal);
    expect(gotenbergSignal).toBe(ctrl.signal);
  });
});
