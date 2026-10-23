import { ForbiddenException } from '@nestjs/common';
import { AutomationsChangeOutputSchema, MAX_AUTOMATIONS_PER_OWNER } from 'shared';
import {
  HOOK_URL,
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
  type AutoWorld,
} from './automations-harness';

const hook = (extra: Record<string, unknown> = {}) =>
  write({ recipe: 'sealed_webhook', url: HOOK_URL, ...extra });

async function createHook(w: AutoWorld): Promise<Record<string, unknown>> {
  return ok(await callAuto(w, 'automations_upsert_recipe', hook()));
}

describe('automations_upsert_recipe', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  it('turns an internal recipe (own mailbox) on at once', async () => {
    const w = autoWorld();
    const out = ok(
      await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })),
    );
    expect(AutomationsChangeOutputSchema.safeParse(out).success).toBe(true);
    expect(out).toMatchObject({
      status: 'saved',
      automation: { recipe: 'declined_notify_me', enabled: true, status_word: null },
    });
    expect(w.approvalRequests).toEqual([]);
  });

  it('saves an external webhook recipe OFF and returns approval_pending; approve turns it on', async () => {
    const w = autoWorld();
    const out = await createHook(w);
    expect(out).toMatchObject({
      status: 'approval_pending',
      automation: {
        enabled: false,
        status_word: 'Off',
        destination_host: 'hooks.example.com',
        awaiting_approval: true,
        payload_detail: 'ids',
      },
    });
    expect(w.approvalRequests).toHaveLength(1);
    expect(w.approvalRequests[0]).toMatchObject({
      kind: 'automation_external_destination',
      tool: 'automations_upsert_recipe',
      ownerId: OWNER,
    });

    const id = (out['automation'] as { id: string }).id;
    const approvalId = out['approval_id'] as string;
    // Not on until the owner decides.
    expect(w.repo.automations.get(id)?.enabled).toBe(false);
    await w.approve(approvalId);
    expect(w.repo.automations.get(id)?.enabled).toBe(true);
  });

  it('never returns the URL path, query or a signing secret', async () => {
    const w = autoWorld();
    const result = await callAuto(w, 'automations_upsert_recipe', hook());
    const text = JSON.stringify(result);
    expect(text).not.toContain('token=zzz');
    expect(text).not.toContain('seald_webhook_');
    expect(w.secretsRepo.rows.size).toBe(1);
  });

  it('stores the URL encrypted, never in config', async () => {
    const w = autoWorld();
    const out = await createHook(w);
    const id = (out['automation'] as { id: string }).id;
    expect(JSON.stringify(w.repo.automations.get(id)?.config)).not.toContain('hooks.example.com/');
    expect(w.repo.automations.get(id)?.config).toEqual({
      url_host: 'hooks.example.com',
      payload_detail: 'ids',
    });
  });

  it('refuses an address Seald will not send to', async () => {
    const w = autoWorld();
    for (const url of [
      'http://hooks.example.com/x',
      'https://127.0.0.1/x',
      'https://localhost/x',
    ]) {
      expect(err(await callAuto(w, 'automations_upsert_recipe', hook({ url }))).slug).toBe(
        'webhook_url_blocked',
      );
    }
    expect(w.repo.automations.size).toBe(0);
  });

  it('answers 503 automation_secrets_not_configured when the key is unset', async () => {
    const w = autoWorld({ secretsKey: undefined });
    const out = err(await callAuto(w, 'automations_upsert_recipe', hook()));
    expect(out.slug).toBe('automation_secrets_not_configured');
    expect(w.repo.automations.size).toBe(0);
  });

  it('needs a url for a webhook recipe and refuses recipes with no executor yet', async () => {
    const w = autoWorld();
    expect(
      err(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'sealed_webhook' }))).slug,
    ).toBe('webhook_url_required');
    expect(
      err(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'sealed_save_drive' })))
        .slug,
    ).toBe('recipe_not_available');
    expect(
      err(
        await callAuto(
          w,
          'automations_upsert_recipe',
          write({ recipe: 'declined_notify_me', url: HOOK_URL }),
        ),
      ).slug,
    ).toBe('validation_error');
  });

  it('keeps an email recipe to the owner mailbox internal and any other address external', async () => {
    const w = autoWorld();
    const own = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ recipe: 'completed_email_copy', recipients: ['Owner@Example.com'] }),
      ),
    );
    expect(own['status']).toBe('saved');
    const other = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ recipe: 'signed_notify_list', recipients: ['lawyer@firm.example'] }),
      ),
    );
    expect(other).toMatchObject({
      status: 'approval_pending',
      automation: { enabled: false, recipients: ['lawyer@firm.example'] },
    });
  });

  it('edits: same URL needs no approval; a new URL or signer data turns it off and asks again', async () => {
    const w = autoWorld();
    const created = await createHook(w);
    const id = (created['automation'] as { id: string }).id;
    await w.approve(created['approval_id'] as string);

    // Rename and resend the same URL: still on, no new approval.
    const same = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ automation_id: id, name: 'Renamed', url: HOOK_URL }),
      ),
    );
    expect(same).toMatchObject({ status: 'saved', automation: { name: 'Renamed', enabled: true } });
    expect(w.approvalRequests).toHaveLength(1);

    // A different URL: off until approved, queued jobs parked.
    const moved = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ automation_id: id, url: 'https://other.example.org/in' }),
      ),
    );
    expect(moved).toMatchObject({
      status: 'approval_pending',
      automation: { enabled: false, destination_host: 'other.example.org' },
    });
    expect(w.repo.parked).toEqual([id]);

    // Signer data in the payload is more data leaving Seald.
    await w.approve(moved['approval_id'] as string);
    const wider = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ automation_id: id, payload_detail: 'with_signer' }),
      ),
    );
    expect(wider).toMatchObject({
      status: 'approval_pending',
      automation: { enabled: false, payload_detail: 'with_signer' },
    });
    // Narrowing back is not external.
    await w.approve(wider['approval_id'] as string);
    const narrower = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ automation_id: id, payload_detail: 'ids' }),
      ),
    );
    expect(narrower).toMatchObject({ status: 'saved', automation: { enabled: true } });
  });

  it('rejects a recipe that does not match the automation being edited', async () => {
    const w = autoWorld();
    const created = await createHook(w);
    const id = (created['automation'] as { id: string }).id;
    expect(
      err(
        await callAuto(
          w,
          'automations_upsert_recipe',
          write({ automation_id: id, recipe: 'sent_webhook' }),
        ),
      ).slug,
    ).toBe('recipe_mismatch');
  });

  it('is owner scoped: another owner cannot edit it, and sees no trace of it', async () => {
    const w = autoWorld();
    const created = await createHook(w);
    const id = (created['automation'] as { id: string }).id;
    const out = err(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ automation_id: id, name: 'Mine now' }),
        { owner: OTHER_OWNER },
      ),
    );
    expect(out.slug).toBe('automation_not_found');
    expect(w.repo.automations.get(id)?.name).not.toBe('Mine now');
  });

  it('checks template scope against the owner own templates', async () => {
    const w = autoWorld();
    const templateId = '33333333-3333-4333-8333-333333333333';
    const base = { recipe: 'declined_notify_me', scope: 'template', template_id: templateId };
    expect(err(await callAuto(w, 'automations_upsert_recipe', write(base))).slug).toBe(
      'template_not_found',
    );
    w.repo.templates.add(templateId);
    expect(ok(await callAuto(w, 'automations_upsert_recipe', write(base)))).toMatchObject({
      automation: { scope: 'template', template_id: templateId },
    });
    expect(
      err(
        await callAuto(
          w,
          'automations_upsert_recipe',
          write({ recipe: 'declined_notify_me', template_id: templateId }),
        ),
      ).slug,
    ).toBe('validation_error');
  });

  it('caps automations per owner', async () => {
    const w = autoWorld();
    for (let i = 0; i < MAX_AUTOMATIONS_PER_OWNER; i++) {
      ok(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })));
    }
    expect(
      err(await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' })))
        .slug,
    ).toBe('automation_limit_reached');
    // Another owner has their own allowance.
    ok(
      await callAuto(w, 'automations_upsert_recipe', write({ recipe: 'declined_notify_me' }), {
        owner: OTHER_OWNER,
      }),
    );
  });

  it('dry_run validates and previews without writing or asking the owner', async () => {
    const w = autoWorld();
    const out = ok(await callAuto(w, 'automations_upsert_recipe', hook({ dry_run: true })));
    expect(out).toEqual({
      dry_run: true,
      would: {
        operation: 'create',
        recipe: 'sealed_webhook',
        enabled_after: false,
        needs_approval: true,
        destination_host: 'hooks.example.com',
      },
    });
    expect(w.repo.automations.size).toBe(0);
    expect(w.secretsRepo.rows.size).toBe(0);
    expect(w.approvalRequests).toEqual([]);
    expect(
      err(
        await callAuto(
          w,
          'automations_upsert_recipe',
          hook({ dry_run: true, url: 'https://127.0.0.1/x' }),
        ),
      ).slug,
    ).toBe('webhook_url_blocked');
  });

  it('removes a just-created recipe when the approval cannot be opened, so a retry does not duplicate', async () => {
    const w = autoWorld();
    (w.services.approvals as unknown as { request: () => Promise<never> }).request = () =>
      Promise.reject(new ForbiddenException('email_not_verified'));
    expect(err(await callAuto(w, 'automations_upsert_recipe', hook())).slug).toBe(
      'email_not_verified',
    );
    expect(w.repo.automations.size).toBe(0);
  });

  it('replays an idempotent call without creating twice', async () => {
    const w = autoWorld();
    const args = hook();
    const first = ok(await callAuto(w, 'automations_upsert_recipe', args));
    const second = ok(await callAuto(w, 'automations_upsert_recipe', args));
    expect(second).toEqual(first);
    expect(w.repo.automations.size).toBe(1);
    expect(w.approvalRequests).toHaveLength(1);
  });

  it('needs automations:write: a read-only key is refused', async () => {
    const w = autoWorld();
    const out = err(await callAuto(w, 'automations_upsert_recipe', hook(), { scopes: READ }));
    expect(out.slug).toBe('insufficient_scope');
    expect(w.repo.automations.size).toBe(0);
  });

  it.each([{ mcpServer: false }, { workflowAutomations: false }])(
    'is not usable while a flag is off (%j)',
    async (flags) => {
      setFlags(flags);
      const w = autoWorld();
      await expect(callAuto(w, 'automations_upsert_recipe', hook())).rejects.toThrow(
        'Tool not found',
      );
    },
  );
});
