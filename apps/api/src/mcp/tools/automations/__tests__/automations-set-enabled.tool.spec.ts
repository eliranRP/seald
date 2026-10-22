import {
  HOOK_URL,
  OTHER_OWNER,
  READ,
  autoWorld,
  callAuto,
  err,
  ok,
  resetFlags,
  setFlags,
  write,
  type AutoWorld,
} from './automations-harness';

async function approvedHook(w: AutoWorld): Promise<string> {
  const created = ok(
    await callAuto(
      w,
      'automations_upsert_recipe',
      write({ recipe: 'sealed_webhook', url: HOOK_URL }),
    ),
  );
  await w.approve(created['approval_id'] as string);
  return (created['automation'] as { id: string }).id;
}

describe('automations_set_enabled', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('turns an automation off at once, with no approval', async () => {
    const w = autoWorld();
    const id = await approvedHook(w);
    const out = ok(
      await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false })),
    );
    expect(out).toMatchObject({
      status: 'saved',
      automation: { enabled: false, status_word: 'Off' },
    });
    expect(w.approvalRequests).toHaveLength(1);
  });

  it('turning an external recipe back on needs the owner again; nothing changes until then', async () => {
    const w = autoWorld();
    const id = await approvedHook(w);
    ok(await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false })));
    const out = ok(
      await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: true })),
    );
    expect(out).toMatchObject({
      status: 'approval_pending',
      automation: { enabled: false, awaiting_approval: true },
    });
    expect(w.approvalRequests).toHaveLength(2);
    expect(w.approvalRequests[1]).toMatchObject({ tool: 'automations_set_enabled' });
    expect(w.repo.automations.get(id)?.enabled).toBe(false);
    await w.approve(out['approval_id'] as string);
    expect(w.repo.automations.get(id)?.enabled).toBe(true);
  });

  it('turns an internal recipe on without approval', async () => {
    const w = autoWorld();
    const created = ok(
      await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })),
    );
    const id = (created['automation'] as { id: string }).id;
    ok(await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false })));
    const on = ok(
      await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: true })),
    );
    expect(on).toMatchObject({ status: 'saved', automation: { enabled: true } });
    expect(w.approvalRequests).toEqual([]);
  });

  it('is a no-op when already in that state', async () => {
    const w = autoWorld();
    const id = await approvedHook(w);
    const out = ok(
      await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: true })),
    );
    expect(out).toMatchObject({ status: 'saved', automation: { enabled: true } });
    expect(w.approvalRequests).toHaveLength(1);
  });

  it('is owner scoped', async () => {
    const w = autoWorld();
    const id = await approvedHook(w);
    const out = err(
      await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false }), {
        owner: OTHER_OWNER,
      }),
    );
    expect(out.slug).toBe('automation_not_found');
    expect(w.repo.automations.get(id)?.enabled).toBe(true);
  });

  it('dry_run reports whether approval would be needed and changes nothing', async () => {
    const w = autoWorld();
    const id = await approvedHook(w);
    ok(await callAuto(w, 'automations_set_enabled', write({ automation_id: id, enabled: false })));
    const out = ok(
      await callAuto(
        w,
        'automations_set_enabled',
        write({ automation_id: id, enabled: true, dry_run: true }),
      ),
    );
    expect(out).toEqual({
      dry_run: true,
      would: { enabled_after: false, needs_approval: true },
    });
    expect(w.approvalRequests).toHaveLength(1);
  });

  it('needs automations:write', async () => {
    const w = autoWorld();
    const out = err(
      await callAuto(
        w,
        'automations_set_enabled',
        write({ automation_id: '33333333-3333-4333-8333-333333333333', enabled: true }),
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
          'automations_set_enabled',
          write({ automation_id: '33333333-3333-4333-8333-333333333333', enabled: true }),
        ),
      ).rejects.toThrow('Tool not found');
    },
  );
});
