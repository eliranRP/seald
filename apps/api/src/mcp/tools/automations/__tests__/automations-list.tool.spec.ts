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
} from './automations-harness';

describe('automations_list', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('lists the owner recipes without any URL or secret, and shows awaiting_approval', async () => {
    const w = autoWorld();
    ok(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })));
    ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ recipe: 'sealed_webhook', url: HOOK_URL }),
      ),
    );
    const result = await callAuto(w, 'automations_list', {}, { scopes: READ });
    const out = ok(result);
    const items = out['items'] as Array<Record<string, unknown>>;
    expect(items.map((i) => [i['recipe'], i['enabled'], i['awaiting_approval']])).toEqual([
      ['sealed_webhook', false, true],
      ['declined_notify_me', true, false],
    ]);
    expect(items[0]).toMatchObject({ status_word: 'Off', destination_host: 'hooks.example.com' });
    const text = JSON.stringify(result);
    expect(text).not.toContain('token=zzz');
    expect(text).not.toContain('seald_webhook_');
    expect(out['next_cursor']).toBeNull();
  });

  it('pages with an opaque cursor', async () => {
    const w = autoWorld();
    for (let i = 0; i < 3; i++) {
      ok(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })));
    }
    const first = ok(await callAuto(w, 'automations_list', { limit: 2 }));
    expect((first['items'] as unknown[]).length).toBe(2);
    expect(typeof first['next_cursor']).toBe('string');
    const second = ok(
      await callAuto(w, 'automations_list', { limit: 2, cursor: first['next_cursor'] }),
    );
    expect((second['items'] as unknown[]).length).toBe(1);
    expect(second['next_cursor']).toBeNull();
    expect(err(await callAuto(w, 'automations_list', { cursor: 'not-a-cursor' })).slug).toBe(
      'invalid_cursor',
    );
  });

  it('is owner scoped', async () => {
    const w = autoWorld();
    ok(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })));
    const other = ok(await callAuto(w, 'automations_list', {}, { owner: OTHER_OWNER }));
    expect(other['items']).toEqual([]);
  });

  it('needs automations:read', async () => {
    const w = autoWorld();
    const out = err(await callAuto(w, 'automations_list', {}, { scopes: ['envelopes:read'] }));
    expect(out.slug).toBe('insufficient_scope');
  });

  it.each([{ mcpServer: false }, { workflowAutomations: false }])(
    'is not listed or callable while a flag is off (%j)',
    async (flags) => {
      setFlags(flags);
      await expect(callAuto(autoWorld(), 'automations_list', {})).rejects.toThrow('Tool not found');
    },
  );
});
