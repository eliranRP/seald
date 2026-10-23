import { makeDriveUploader } from '../drive-uploader.adapters';
import { DriveUpstreamError } from '../dto/error-codes';

function res(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('Drive folder ops (WP-32 additions to the uploader binding)', () => {
  it('findFileByName builds an escaped, parent-scoped query and returns the first file', async () => {
    const fetchMock = jest.fn(async () => res(200, { files: [{ id: 'F1', name: "O'Brien" }] }));
    const drive = makeDriveUploader(fetchMock as unknown as typeof fetch);
    const found = await drive.findFileByName({
      accessToken: 't',
      name: "O'Brien",
      parentId: 'root',
      folder: true,
    });
    expect(found?.id).toBe('F1');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const url = new URL(calls[0]![0]);
    const q = url.searchParams.get('q')!;
    expect(q).toContain("name = 'O\\'Brien'");
    expect(q).toContain("'root' in parents");
    expect(q).toContain('trashed = false');
    expect(q).toContain('application/vnd.google-apps.folder');
    expect((calls[0]![1].headers as Record<string, string>)['authorization']).toBe('Bearer t');
  });

  it('findFileByName returns null for an empty list and maps errors', async () => {
    const empty = makeDriveUploader((async () =>
      res(200, { files: [] })) as unknown as typeof fetch);
    expect(await empty.findFileByName({ accessToken: 't', name: 'x', parentId: 'p' })).toBeNull();
    const boom = makeDriveUploader((async () => res(503, {})) as unknown as typeof fetch);
    await expect(
      boom.findFileByName({ accessToken: 't', name: 'x', parentId: 'p' }),
    ).rejects.toBeInstanceOf(DriveUpstreamError);
  });

  it('createFolder posts a folder mime type, with the parent only when given', async () => {
    const fetchMock = jest.fn(async () => res(200, { id: 'D1', name: 'Seald' }));
    const drive = makeDriveUploader(fetchMock as unknown as typeof fetch);
    const out = await drive.createFolder({ accessToken: 't', name: 'Seald' });
    expect(out.id).toBe('D1');
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(calls[0]![1].body as string)).toEqual({
      name: 'Seald',
      mimeType: 'application/vnd.google-apps.folder',
    });
  });
});
