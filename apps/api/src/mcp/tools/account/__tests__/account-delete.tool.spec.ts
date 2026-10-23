import { ForbiddenException } from '@nestjs/common';
import { AccountDeleteOutputSchema } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import {
  OWNER,
  KEY_ID,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from './gated-harness';

describe('account_delete (WP-45)', () => {
  it('returns approval_pending and deletes nothing', async () => {
    const w = gatedWorld();
    const out = ok(await call(w, 'account_delete', write(), principal(['account:admin'])));
    expect(AccountDeleteOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({ status: 'approval_pending', approve_requires: 'session' });
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(w.requests).toEqual([
      {
        requester: { ownerId: OWNER, apiKeyId: KEY_ID },
        kind: 'account_delete',
        tool: 'account_delete',
        args: {},
        now: expect.any(Date),
      },
    ]);
    // The tool never reaches the deletion.
    expect(w.actions()).toEqual([]);
  });

  it('dry_run runs the approval checks without opening one', async () => {
    const w = gatedWorld();
    const out = ok(await call(w, 'account_delete', dryRun(), principal(['account:admin'])));
    expect(out).toMatchObject({ dry_run: true, would: { requires: 'owner_approval' } });
    expect(w.previews.map((p) => p.kind)).toEqual(['account_delete']);
    expect(w.requests).toEqual([]);
  });

  it('needs account:admin', async () => {
    const w = gatedWorld();
    expect(errorOf(await call(w, 'account_delete', write(), principal(['keys:admin']))).slug).toBe(
      'insufficient_scope',
    );
    expect(w.requests).toEqual([]);
  });

  it('passes a refused ask through as its slug (unverified mailbox)', async () => {
    const w = gatedWorld();
    w.answers.set('approvals.request', new ForbiddenException('email_not_verified'));
    expect(
      errorOf(await call(w, 'account_delete', write(), principal(['account:admin']))).slug,
    ).toBe('email_not_verified');
  });
});
