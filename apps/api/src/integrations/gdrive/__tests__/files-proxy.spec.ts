import { makeFilesProxy } from '../files-proxy';

interface FetchCall {
  url: string;
  init: { headers?: Record<string, string> } | undefined;
}

function fakeFetch(
  responder: (call: FetchCall) => { ok: boolean; status: number; body: unknown },
): { fetch: typeof fetch; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const f = (async (
    input: string | URL,
    init?: { headers?: Record<string, string> },
  ): Promise<unknown> => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const out = responder({ url, init });
    return {
      ok: out.ok,
      status: out.status,
      json: async (): Promise<unknown> => out.body,
    };
  }) as unknown as typeof fetch;
  return { fetch: f, calls };
}

describe('makeFilesProxy', () => {
  it('forwards the access token via Authorization: Bearer header', async () => {
    const { fetch: f, calls } = fakeFetch(() => ({ ok: true, status: 200, body: { files: [] } }));
    const proxy = makeFilesProxy(f);
    await proxy({ accessToken: 'super-secret-token', mimeFilter: 'pdf' });
    expect(calls[0]?.init?.headers).toMatchObject({ authorization: 'Bearer super-secret-token' });
  });

  it('maps mimeFilter pdf → application/pdf q-param', async () => {
    const { fetch: f, calls } = fakeFetch(() => ({ ok: true, status: 200, body: { files: [] } }));
    await makeFilesProxy(f)({ accessToken: 't', mimeFilter: 'pdf' });
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain("mimeType='application/pdf'");
    // URLSearchParams turns ` ` into `+`; check the literal contract.
    expect(decodeURIComponent((calls[0]?.url ?? '').replace(/\+/g, ' '))).toContain(
      'trashed = false',
    );
  });

  it('maps mimeFilter doc → google-apps.document', async () => {
    const { fetch: f, calls } = fakeFetch(() => ({ ok: true, status: 200, body: { files: [] } }));
    await makeFilesProxy(f)({ accessToken: 't', mimeFilter: 'doc' });
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain(
      "mimeType='application/vnd.google-apps.document'",
    );
  });

  it('maps mimeFilter docx → wordprocessingml.document', async () => {
    const { fetch: f, calls } = fakeFetch(() => ({ ok: true, status: 200, body: { files: [] } }));
    await makeFilesProxy(f)({ accessToken: 't', mimeFilter: 'docx' });
    expect(decodeURIComponent(calls[0]?.url ?? '')).toContain(
      "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    );
  });

  it('maps mimeFilter all → union of pdf + doc + docx (no broader)', async () => {
    const { fetch: f, calls } = fakeFetch(() => ({ ok: true, status: 200, body: { files: [] } }));
    await makeFilesProxy(f)({ accessToken: 't', mimeFilter: 'all' });
    const decoded = decodeURIComponent(calls[0]?.url ?? '');
    expect(decoded).toContain("mimeType='application/pdf'");
    expect(decoded).toContain("mimeType='application/vnd.google-apps.document'");
    expect(decoded).toContain(
      "mimeType='application/vnd.openxmlformats-officedocument.wordprocessingml.document'",
    );
  });

  it('throws drive_files_list_failed: <status> on non-ok response (without leaking the token)', async () => {
    const { fetch: f } = fakeFetch(() => ({ ok: false, status: 401, body: {} }));
    const err = await makeFilesProxy(f)({
      accessToken: 'super-secret-token',
      mimeFilter: 'pdf',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('drive_files_list_failed: 401');
    expect((err as Error).message).not.toContain('super-secret-token');
  });

  it('returns an empty files array when the upstream omits the field', async () => {
    const { fetch: f } = fakeFetch(() => ({ ok: true, status: 200, body: {} }));
    const out = await makeFilesProxy(f)({ accessToken: 't', mimeFilter: 'all' });
    expect(out.files).toEqual([]);
  });
});
