import { AutomationsRotateSecretOutputSchema } from 'shared';
import { resetFlags, setFlags } from '../../__tests__/write-harness';
import {
  AUTOMATION_ID,
  call,
  dryRun,
  errorOf,
  gatedWorld,
  ok,
  principal,
  write,
} from '../../account/__tests__/gated-harness';

const WRITER = principal(['automations:write']);

describe('automations_rotate_secret (WP-45)', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('returns approval_pending, rotates nothing and never carries the secret', async () => {
    const w = gatedWorld();
    const out = ok(
      await call(w, 'automations_rotate_secret', write({ automation_id: AUTOMATION_ID }), WRITER),
    );
    expect(AutomationsRotateSecretOutputSchema.safeParse(out).success).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/"[a-z_]*secret":/);
    expect(w.requests.map((r) => [r.kind, r.args])).toEqual([
      ['automation_rotate_secret', { automation_id: AUTOMATION_ID }],
    ]);
    expect(w.actions()).toEqual([]);
  });

  it('dry_run opens nothing', async () => {
    const w = gatedWorld();
    ok(
      await call(w, 'automations_rotate_secret', dryRun({ automation_id: AUTOMATION_ID }), WRITER),
    );
    expect(w.requests).toEqual([]);
    expect(w.previews).toHaveLength(1);
  });

  it('is hidden while workflowAutomations is off', async () => {
    setFlags({ workflowAutomations: false });
    const w = gatedWorld();
    // Same answer as a tool that does not exist.
    await expect(
      call(w, 'automations_rotate_secret', write({ automation_id: AUTOMATION_ID }), WRITER),
    ).rejects.toThrow('Tool not found');
    expect(w.requests).toEqual([]);
  });

  it('needs automations:write', async () => {
    const w = gatedWorld();
    expect(
      errorOf(
        await call(
          w,
          'automations_rotate_secret',
          write({ automation_id: AUTOMATION_ID }),
          principal(['automations:read']),
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
