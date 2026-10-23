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

async function recipe(w: ReturnType<typeof autoWorld>, owner = OWNER): Promise<string> {
  const out = ok(
    await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' }), {
      owner,
    }),
  );
  return (out['automation'] as { id: string }).id;
}

describe('automations_list_runs', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('lists runs newest first with status words and plain failures', async () => {
    const w = autoWorld();
    const id = await recipe(w);
    w.repo.seedRun(OWNER, id, { status: 'done', lastError: null, responseStatus: 200 });
    w.repo.seedRun(OWNER, id, {
      status: 'retrying',
      lastError: 'webhook_bad_status',
      retryable: true,
    });
    w.repo.seedRun(OWNER, id, { status: 'queued', lastError: null });
    w.repo.seedRun(OWNER, id, { status: 'failed', lastError: 'http_404', retryable: false });
    const out = ok(
      await callAuto(
        w,
        'automations_list_runs',
        { automation_id: id },
        { scopes: ['automations:read'] },
      ),
    );
    const items = out['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => [i['status'], i['status_word'], i['retry_allowed']])).toEqual([
      ['failed', 'Failed', false],
      ['queued', null, false],
      ['retrying', 'Retrying', false],
      ['done', 'Done', false],
    ]);
    expect(items[0]).toMatchObject({
      failure_slug: 'http_404',
      failure_message: expect.stringContaining('HTTP 404') as string,
    });
    expect(items[3]).toMatchObject({ failure_slug: null, failure_message: null });
  });

  it('filters by status and pages with a cursor', async () => {
    const w = autoWorld();
    const id = await recipe(w);
    for (let i = 0; i < 3; i++) w.repo.seedRun(OWNER, id);
    w.repo.seedRun(OWNER, id, { status: 'done', lastError: null });
    const failed = ok(await callAuto(w, 'automations_list_runs', { status: 'failed', limit: 2 }));
    expect((failed['items'] as unknown[]).length).toBe(2);
    const next = ok(
      await callAuto(w, 'automations_list_runs', {
        status: 'failed',
        limit: 2,
        cursor: failed['next_cursor'],
      }),
    );
    expect((next['items'] as unknown[]).length).toBe(1);
    expect(next['next_cursor']).toBeNull();
    expect(err(await callAuto(w, 'automations_list_runs', { cursor: '???' })).slug).toBe(
      'invalid_cursor',
    );
  });

  it('is owner scoped, including the automation_id filter', async () => {
    const w = autoWorld();
    const mine = await recipe(w);
    const theirs = await recipe(w, OTHER_OWNER);
    w.repo.seedRun(OWNER, mine);
    w.repo.seedRun(OTHER_OWNER, theirs);
    const out = ok(await callAuto(w, 'automations_list_runs', {}));
    expect((out['items'] as unknown[]).length).toBe(1);
    expect(err(await callAuto(w, 'automations_list_runs', { automation_id: theirs })).slug).toBe(
      'automation_not_found',
    );
  });

  it('needs automations:read', async () => {
    const out = err(
      await callAuto(autoWorld(), 'automations_list_runs', {}, { scopes: ['envelopes:read'] }),
    );
    expect(out.slug).toBe('insufficient_scope');
  });

  it.each([{ mcpServer: false }, { workflowAutomations: false }])(
    'is not usable while a flag is off (%j)',
    async (flags) => {
      setFlags(flags);
      await expect(callAuto(autoWorld(), 'automations_list_runs', {})).rejects.toThrow(
        'Tool not found',
      );
    },
  );
});
