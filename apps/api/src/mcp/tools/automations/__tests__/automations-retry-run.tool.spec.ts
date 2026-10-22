import {
  OTHER_OWNER,
  OWNER,
  READ,
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

describe('automations_retry_run', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('re-enqueues a retryable failed run under the same id; a second tap does nothing', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w));
    const first = ok(await callAuto(w, 'automations_retry_run', write({ run_id: run.id })));
    expect(first).toMatchObject({
      status: 'queued',
      run: { id: run.id, status: 'queued', status_word: null, attempts: 0, retry_allowed: false },
    });
    const second = ok(await callAuto(w, 'automations_retry_run', write({ run_id: run.id })));
    expect(second).toMatchObject({ status: 'already_queued', run: { id: run.id } });
  });

  it('refuses a permanent failure with retry_not_allowed', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w), { retryable: false, lastError: 'http_404' });
    expect(err(await callAuto(w, 'automations_retry_run', write({ run_id: run.id }))).slug).toBe(
      'retry_not_allowed',
    );
    expect(w.repo.runs.get(run.id)?.status).toBe('failed');
  });

  it('refuses a run that did not fail', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w), { status: 'done', retryable: true });
    expect(err(await callAuto(w, 'automations_retry_run', write({ run_id: run.id }))).slug).toBe(
      'retry_not_allowed',
    );
  });

  it('refuses while the automation is off, so a retry cannot reach an unapproved destination', async () => {
    const w = autoWorld();
    const id = await recipe(w);
    const run = w.repo.seedRun(OWNER, id);
    ok(await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false })));
    expect(err(await callAuto(w, 'automations_retry_run', write({ run_id: run.id }))).slug).toBe(
      'automation_disabled',
    );
    expect(w.repo.runs.get(run.id)?.hasJob).toBe(false);
  });

  it('is owner scoped', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w));
    const out = err(
      await callAuto(w, 'automations_retry_run', write({ run_id: run.id }), { owner: OTHER_OWNER }),
    );
    expect(out.slug).toBe('automation_run_not_found');
    expect(w.repo.runs.get(run.id)?.status).toBe('failed');
  });

  it('dry_run runs the same checks and enqueues nothing', async () => {
    const w = autoWorld();
    const run = w.repo.seedRun(OWNER, await recipe(w));
    const out = ok(
      await callAuto(w, 'automations_retry_run', write({ run_id: run.id, dry_run: true })),
    );
    expect(out).toEqual({ dry_run: true, would: { run_id: run.id, already_queued: false } });
    expect(w.repo.runs.get(run.id)?.hasJob).toBe(false);
    const permanent = w.repo.seedRun(OWNER, run.automationId, { retryable: false });
    expect(
      err(
        await callAuto(w, 'automations_retry_run', write({ run_id: permanent.id, dry_run: true })),
      ).slug,
    ).toBe('retry_not_allowed');
  });

  it('needs automations:write', async () => {
    const out = err(
      await callAuto(
        autoWorld(),
        'automations_retry_run',
        write({ run_id: '33333333-3333-4333-8333-333333333333' }),
        { scopes: READ },
      ),
    );
    expect(out.slug).toBe('insufficient_scope');
  });

  it.each([{ mcpServer: false }, { workflowAutomations: false }])(
    'is not usable while a flag is off (%j)',
    async (flags) => {
      setFlags(flags);
      await expect(
        callAuto(
          autoWorld(),
          'automations_retry_run',
          write({ run_id: '33333333-3333-4333-8333-333333333333' }),
        ),
      ).rejects.toThrow('Tool not found');
    },
  );
});
