import { listTools } from '../../../tool-catalog';
import {
  ACCOUNT_ID,
  KEY_ID,
  OWNER,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
} from '../../__tests__/write-harness';
import { APPROVAL_ID, callStep, stepWorld } from '../../contacts/__tests__/step-world';

describe('gdrive_disconnect', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('never disconnects: it asks the owner and returns approval_pending with a review_url', async () => {
    const w = stepWorld();
    const out = ok(await callStep(w, 'gdrive_disconnect', write({})));
    expect(out).toMatchObject({
      status: 'approval_pending',
      message: 'pending owner approval',
      approval_id: APPROVAL_ID,
      approve_requires: 'session',
    });
    expect(out['review_url']).toBe(`https://seald.test/approve/${APPROVAL_ID}/review`);
    // One approval, for this owner and key, naming the only connected account.
    expect(w.approvalCalls).toEqual([
      {
        requester: { ownerId: OWNER, apiKeyId: KEY_ID },
        kind: 'gdrive_disconnect',
        tool: 'gdrive_disconnect',
        args: { account_id: ACCOUNT_ID },
        now: expect.any(Date),
      },
    ]);
    // The account is still connected.
    expect(w.drive.accounts[0]?.deletedAt).toBeNull();
  });

  it('names the account when given, refuses one that is not connected, and a dry run asks nobody', async () => {
    const w = stepWorld();
    ok(await callStep(w, 'gdrive_disconnect', write({ account_id: ACCOUNT_ID })));
    expect(w.approvalCalls).toHaveLength(1);
    expect(
      err(
        await callStep(
          w,
          'gdrive_disconnect',
          write({ account_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }),
        ),
      ).slug,
    ).toBe('gdrive_account_not_found');
    const dry = ok(
      await callStep(w, 'gdrive_disconnect', {
        idempotency_key: 'dry-00000007',
        dry_run: true,
      }),
    );
    expect(dry).toMatchObject({
      dry_run: true,
      would: { account_id: ACCOUNT_ID, disconnects: false },
    });
    expect(w.approvalCalls).toHaveLength(1);
  });

  it('is destructive and open-world, needs gdrive:write, and is hidden while Drive is off', async () => {
    const w = stepWorld();
    const listed = listTools().find((t) => t.name === 'gdrive_disconnect');
    expect(listed?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: true,
    });
    expect(listed?._meta['seald/scopes']).toEqual(['gdrive:write']);
    expect(
      err(await callStep(w, 'gdrive_disconnect', write({}), { scopes: ['gdrive:read'] })).slug,
    ).toBe('insufficient_scope');
    setFlags({ gdriveIntegration: false });
    expect(listTools().map((t) => t.name)).not.toContain('gdrive_disconnect');
    await expect(callStep(w, 'gdrive_disconnect', write({}))).rejects.toThrow('Tool not found');
    expect(w.approvalCalls).toHaveLength(0);
  });

  it('replays the same approval for the same idempotency key', async () => {
    const w = stepWorld();
    const args = write({});
    const first = ok(await callStep(w, 'gdrive_disconnect', args));
    expect(ok(await callStep(w, 'gdrive_disconnect', args))).toEqual(first);
    expect(w.approvalCalls).toHaveLength(1);
  });
});
