import { GdriveFilesOutputSchema } from 'shared';
import {
  ACCOUNT_ID,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  writeWorld,
} from '../../__tests__/write-harness';

describe('gdrive_list_files', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('lists through GDriveService.listFiles with the one connected account, paged', async () => {
    const w = writeWorld();
    w.drive.files.set('f1', { id: 'f1', name: 'Lease.pdf', mimeType: 'application/pdf', size: 10 });
    const out = ok(
      await callWrite(w, 'gdrive_list_files', { mime: 'pdf', limit: 5, cursor: 'tok' }),
    );
    expect(GdriveFilesOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toEqual({
      account_id: ACCOUNT_ID,
      files: [
        {
          id: 'f1',
          name: 'Lease.pdf',
          mime_type: 'application/pdf',
          modified_time: null,
          size: 10,
        },
      ],
      next_cursor: 'next-page',
    });
    expect(w.drive.listCalls).toEqual([
      { accountId: ACCOUNT_ID, mime: 'pdf', pageSize: 5, pageToken: 'tok' },
    ]);
  });

  it('needs account_id with several accounts, and says how to connect with none', async () => {
    const w = writeWorld();
    w.drive.accounts.push({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      googleEmail: 'second@gmail.test',
      connectedAt: '2026-09-03T00:00:00.000Z',
      deletedAt: null,
    });
    expect(err(await callWrite(w, 'gdrive_list_files', {})).slug).toBe('gdrive_account_required');
    expect(
      ok(await callWrite(w, 'gdrive_list_files', { account_id: ACCOUNT_ID }))['account_id'],
    ).toBe(ACCOUNT_ID);
    expect(
      err(
        await callWrite(w, 'gdrive_list_files', {
          account_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        }),
      ).slug,
    ).toBe('gdrive_account_not_found');
    w.drive.accounts.length = 0;
    expect(err(await callWrite(w, 'gdrive_list_files', {}))).toMatchObject({
      slug: 'gdrive_not_connected',
      url: 'https://seald.test/settings/integrations',
    });
  });

  it('needs gdrive:read and rejects an unknown mime filter', async () => {
    const w = writeWorld();
    expect(
      err(await callWrite(w, 'gdrive_list_files', {}, { scopes: ['documents:write'] })).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'gdrive_list_files', { mime: 'xlsx' })).slug).toBe(
      'validation_error',
    );
  });
});
