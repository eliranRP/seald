import { AutomationRunOutputSchema } from 'shared';
import {
  OTHER_OWNER,
  OWNER,
  autoWorld,
  callAuto,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
} from './automations-harness';

async function recipe(w: ReturnType<typeof autoWorld>): Promise<string> {
  const out = ok(
    await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })),
  );
  return (out['automation'] as { id: string }).id;
}

describe('automations_get_run', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('returns the run, the plain failure and whether Retry is allowed', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w));
    const out = ok(
      await callAuto(
        w,
        'automations_get_run',
        { run_id: run.id },
        { scopes: ['automations:read'] },
      ),
    );
    expect(AutomationRunOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      id: run.id,
      status: 'failed',
      status_word: 'Failed',
      failure_slug: 'attempts_exhausted',
      retry_allowed: true,
      response_status: 503,
    });
    expect(typeof out['failure_message']).toBe('string');
  });

  it('says Retry is not allowed for a permanent failure', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w), {
      retryable: false,
      lastError: 'webhook_url_blocked',
      responseStatus: null,
    });
    const out = ok(await callAuto(w, 'automations_get_run', { run_id: run.id }));
    expect(out).toMatchObject({ retry_allowed: false, failure_slug: 'webhook_url_blocked' });
  });

  it('is owner scoped: another owner gets automation_run_not_found', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w));
    const out = err(
      await callAuto(w, 'automations_get_run', { run_id: run.id }, { owner: OTHER_OWNER }),
    );
    expect(out.slug).toBe('automation_run_not_found');
  });

  it('needs automations:read', async () => {
    const out = err(
      await callAuto(
        autoWorld(),
        'automations_get_run',
        { run_id: '33333333-3333-4333-8333-333333333333' },
        { scopes: ['envelopes:read'] },
      ),
    );
    expect(out.slug).toBe('insufficient_scope');
  });

  it.each([{ mcpServer: false }, { workflowAutomations: false }])(
    'is not usable while a flag is off (%j)',
    async (flags) => {
      setFlags(flags);
      await expect(
        callAuto(autoWorld(), 'automations_get_run', {
          run_id: '33333333-3333-4333-8333-333333333333',
        }),
      ).rejects.toThrow('Tool not found');
    },
  );
});
