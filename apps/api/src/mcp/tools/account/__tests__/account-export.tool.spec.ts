import { AccountExportOutputSchema } from 'shared';
import { call, dryRun, errorOf, gatedWorld, ok, principal, write } from './gated-harness';

describe('account_export (WP-45)', () => {
  it('returns approval_pending and never hands the export to the agent', async () => {
    const w = gatedWorld();
    const out = ok(await call(w, 'account_export', write(), principal(['account:admin'])));
    expect(AccountExportOutputSchema.safeParse(out).success).toBe(true);
    expect(Object.keys(out).sort()).toEqual(
      ['approval_id', 'approve_requires', 'message', 'review_url', 'status', 'summary'].sort(),
    );
    expect(w.requests.map((r) => [r.kind, r.args])).toEqual([['account_export', {}]]);
    expect(w.actions()).toEqual([]);
  });

  it('dry_run opens nothing', async () => {
    const w = gatedWorld();
    ok(await call(w, 'account_export', dryRun(), principal(['account:admin'])));
    expect(w.requests).toEqual([]);
    expect(w.previews).toHaveLength(1);
  });

  it('needs account:admin', async () => {
    const w = gatedWorld();
    expect(errorOf(await call(w, 'account_export', write())).slug).toBe('insufficient_scope');
  });
});
