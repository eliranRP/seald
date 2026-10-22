import { listTools } from '../../../tool-catalog';
import {
  ACCOUNT_ID,
  callWrite,
  err,
  ok,
  resetFlags,
  setFlags,
  writeWorld,
} from '../../__tests__/write-harness';

describe('gdrive_list_accounts', () => {
  afterEach(() => resetFlags());

  it('lists connected accounts without tokens and skips disconnected ones', async () => {
    setFlags();
    const w = writeWorld();
    w.drive.accounts.push({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      googleEmail: 'gone@gmail.test',
      connectedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: '2026-09-02T00:00:00.000Z',
    });
    const out = ok(await callWrite(w, 'gdrive_list_accounts', {}));
    expect(out).toEqual({
      accounts: [
        {
          id: ACCOUNT_ID,
          google_email: 'owner@gmail.test',
          connected_at: '2026-09-01T00:00:00.000Z',
          token_status: 'live',
        },
      ],
    });
  });

  it('needs gdrive:read, rejects unknown fields, and is hidden while Drive is off', async () => {
    setFlags();
    const w = writeWorld();
    expect(
      err(await callWrite(w, 'gdrive_list_accounts', {}, { scopes: ['envelopes:read'] })).slug,
    ).toBe('insufficient_scope');
    expect(err(await callWrite(w, 'gdrive_list_accounts', { x: 1 })).slug).toBe('validation_error');
    setFlags({ gdriveIntegration: false });
    expect(
      listTools()
        .map((t) => t.name)
        .filter((n) => n.startsWith('gdrive_')),
    ).toEqual([]);
    await expect(callWrite(w, 'gdrive_list_accounts', {})).rejects.toThrow('Tool not found');
  });
});
