import type { ApprovalKindRegistry } from '../../../../approvals/kinds/approval-kind.registry';
import type { ApprovalKindHandler } from '../../../../approvals/kinds/approval-kind';
import type { AutomationsService } from '../../../../automations/automations.service';
import { automationExternalDestinationHandler } from '../automation-approval-kind';
import { AutomationApprovalRegistrar } from '../automation-approval.registrar';
import {
  HOOK_URL,
  NOW,
  OTHER_OWNER,
  OWNER,
  OWNER_EMAIL,
  autoWorld,
  callAuto,
  ok,
  resetFlags,
  setFlags,
  write,
} from './automations-harness';

const ctx = (ownerId = OWNER) => ({ ownerId, ownerEmail: OWNER_EMAIL, now: NOW });

describe('automation_external_destination approval kind', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  async function pending() {
    const w = autoWorld();
    const out = ok(
      await callAuto(
        w,
        'automations_upsert_recipe',
        write({ recipe: 'sealed_webhook', url: HOOK_URL }),
      ),
    );
    const id = (out['automation'] as { id: string }).id;
    return { w, id, handler: automationExternalDestinationHandler(w.service) };
  }

  it('is ready, email-first (not high risk) and takes only an automation id', async () => {
    const { handler, id } = await pending();
    expect(handler).toMatchObject({
      kind: 'automation_external_destination',
      tool: 'automations_upsert_recipe',
      ready: true,
    });
    expect(handler.highRisk({ automation_id: id })).toBe(false);
    expect(handler.args.safeParse({ automation_id: id, url: 'https://x.test' }).success).toBe(
      false,
    );
  });

  it('describes the destination host and path (never the query) and covers the full URL in the hash input', async () => {
    const { handler, id, w } = await pending();
    const described = await handler.describe({ automation_id: id }, ctx());
    expect(described).toMatchObject({
      subjectKey: `automation:${id}`,
      destination: { kind: 'webhook', label: 'hooks.example.com/seald/inbound' },
      envelopeId: null,
    });
    expect(JSON.stringify(described)).not.toContain('token=zzz');
    const before = described.extra?.['destination_sha256'];
    await callAuto(
      w,
      'automations_upsert_recipe',
      write({ automation_id: id, url: `${HOOK_URL}&x=1` }),
    );
    const after = (await handler.describe({ automation_id: id }, ctx())).extra?.[
      'destination_sha256'
    ];
    expect(after).not.toBe(before);
  });

  it('is owner scoped: another owner cannot describe or approve it', async () => {
    const { handler, id, w } = await pending();
    await expect(handler.describe({ automation_id: id }, ctx(OTHER_OWNER))).rejects.toThrow(
      'automation_not_found',
    );
    await expect(
      handler.execute(
        { automation_id: id },
        { ...ctx(OTHER_OWNER), approvalId: 'a', audit: { ip: null, user_agent: null } },
      ),
    ).rejects.toThrow('automation_not_found');
    expect(w.repo.automations.get(id)?.enabled).toBe(false);
  });

  it('execute turns the recipe on', async () => {
    const { handler, id, w } = await pending();
    const result = await handler.execute(
      { automation_id: id },
      { ...ctx(), approvalId: 'a', audit: { ip: null, user_agent: null } },
    );
    expect(result).toEqual({ automation_id: id, enabled: true });
    expect(w.repo.automations.get(id)?.enabled).toBe(true);
  });

  it('the registrar replaces the stub with the real handler at boot', () => {
    const w = autoWorld();
    const registered: ApprovalKindHandler[] = [];
    const registry = {
      register: (h: ApprovalKindHandler) => registered.push(h),
    } as unknown as ApprovalKindRegistry;
    new AutomationApprovalRegistrar(registry, w.service as AutomationsService).onModuleInit();
    // WP-30's kind, and WP-45's webhook secret rotation.
    expect(registered.map((h) => [h.kind, h.ready])).toEqual([
      ['automation_external_destination', true],
      ['automation_rotate_secret', true],
    ]);
  });
});
