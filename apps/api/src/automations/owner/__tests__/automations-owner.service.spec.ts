import { NotFoundException } from '@nestjs/common';
import type { AppEnv } from '../../../config/env.schema';
import {
  HOOK_URL,
  OTHER_OWNER,
  OWNER,
  autoWorld,
  callAuto,
  ok,
  resetFlags,
  setFlags,
  write,
} from '../../../mcp/tools/automations/__tests__/automations-harness';
import { AutomationsOwnerService } from '../automations-owner.service';

const env = (over: Partial<AppEnv> = {}) => ({ ...over }) as unknown as AppEnv;

function owner(over: Partial<AppEnv> = {}) {
  const w = autoWorld();
  return { w, svc: new AutomationsOwnerService(w.service, env(over)) };
}

describe('AutomationsOwnerService (WP-31)', () => {
  beforeEach(() => setFlags());
  afterEach(() => resetFlags());

  describe('gate', () => {
    it('is 404 while workflowAutomations is off', () => {
      setFlags({ workflowAutomations: false });
      expect(() => owner().svc.gate()).toThrow(NotFoundException);
    });

    it('is 404 under the AUTOMATIONS_DISABLED kill switch', () => {
      expect(() => owner({ AUTOMATIONS_DISABLED: true }).svc.gate()).toThrow(NotFoundException);
    });

    it('is open with the flag on', () => {
      expect(() => owner().svc.gate()).not.toThrow();
    });

    it('treats a malformed id as 404, never 400', () => {
      expect(() => AutomationsOwnerService.requireId('nope')).toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('turns an external webhook on at once with no approval, and shows the secret once', async () => {
      const { w, svc } = owner();
      const out = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      expect(out.automation).toMatchObject({
        enabled: true,
        awaiting_approval: false,
        secret_set: true,
        destination_host: 'hooks.example.com',
        last_run: null,
      });
      expect(out.secret).toMatch(/^seald_webhook_/);
      expect(w.approvalRequests).toHaveLength(0);
      // The URL and the secret are in no later read.
      const later = JSON.stringify([
        await svc.get(OWNER, out.automation.id),
        await svc.list(OWNER),
      ]);
      expect(later).not.toContain(out.secret);
      expect(later).not.toContain('token=zzz');
      expect(later).not.toContain('/seald/inbound');
    });

    it('gives no secret for a recipe that has none', async () => {
      const { svc } = owner();
      const out = await svc.create(OWNER, { recipe: 'declined_notify_me' });
      expect(out.secret).toBeUndefined();
      expect(out.automation).toMatchObject({ enabled: true, secret_set: false });
    });

    it('an agent create through MCP never carries the secret', async () => {
      const w = autoWorld();
      const out = JSON.stringify(
        ok(
          await callAuto(
            w,
            'automations_upsert_recipe',
            write({ recipe: 'sealed_webhook', url: HOOK_URL }),
          ),
        ),
      );
      expect(out).not.toContain('seald_webhook_');
    });
  });

  describe('save clears a pending approval', () => {
    it('settles the approval an agent left open when the owner saves an edit', async () => {
      const { w, svc } = owner();
      const created = ok(
        await callAuto(
          w,
          'automations_upsert_recipe',
          write({ recipe: 'sealed_webhook', url: HOOK_URL }),
        ),
      );
      const id = (created['automation'] as { id: string }).id;
      expect(w.repo.waiting.has(id)).toBe(true);
      await expect(w.service.isAwaitingApproval(OWNER, id)).resolves.toBe(true);

      const out = await svc.update(OWNER, id, { name: 'Mine', enabled: true });
      expect(w.repo.waiting.has(id)).toBe(false);
      expect(out.automation).toMatchObject({
        name: 'Mine',
        enabled: true,
        awaiting_approval: false,
      });
    });

    it('turning an agent-made external recipe on in the app needs no approval', async () => {
      const { w, svc } = owner();
      const created = ok(
        await callAuto(
          w,
          'automations_upsert_recipe',
          write({ recipe: 'sealed_webhook', url: HOOK_URL }),
        ),
      );
      const id = (created['automation'] as { id: string }).id;
      const out = await svc.update(OWNER, id, { enabled: true });
      expect(out.automation.enabled).toBe(true);
      expect(w.approvalRequests).toHaveLength(1);
    });

    it('a changed webhook address saved in the app stays on', async () => {
      const { svc } = owner();
      const { automation } = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      const out = await svc.update(OWNER, automation.id, {
        url: 'https://other.example.com/hook',
        payloadDetail: 'with_signer',
      });
      expect(out.automation).toMatchObject({
        enabled: true,
        destination_host: 'other.example.com',
        payload_detail: 'with_signer',
        awaiting_approval: false,
      });
    });
  });

  describe('rotate secret', () => {
    it('returns a new secret once and a retire time 24 hours out', async () => {
      const { svc } = owner();
      const { automation, secret } = await svc.create(OWNER, {
        recipe: 'sealed_webhook',
        url: HOOK_URL,
      });
      const rotated = await svc.rotateSecret(OWNER, automation.id);
      expect(rotated.secret).toMatch(/^seald_webhook_/);
      expect(rotated.secret).not.toBe(secret);
      const hours = (Date.parse(rotated.previous_retires_at) - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(23.9);
      expect(hours).toBeLessThanOrEqual(24);
      expect(JSON.stringify(await svc.get(OWNER, automation.id))).not.toContain(rotated.secret);
    });

    it('refuses a recipe that is not a webhook', async () => {
      const { svc } = owner();
      const { automation } = await svc.create(OWNER, { recipe: 'declined_notify_me' });
      await expect(svc.rotateSecret(OWNER, automation.id)).rejects.toThrow('not_a_webhook');
    });
  });

  describe('owner isolation', () => {
    it('another owner sees 404 for every read and write', async () => {
      const { w, svc } = owner();
      const { automation } = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      const run = w.repo.seedRun(OWNER, automation.id);
      expect((await svc.list(OTHER_OWNER)).items).toHaveLength(0);
      await expect(svc.get(OTHER_OWNER, automation.id)).rejects.toThrow(NotFoundException);
      await expect(svc.update(OTHER_OWNER, automation.id, { name: 'x' })).rejects.toThrow(
        NotFoundException,
      );
      await expect(svc.remove(OTHER_OWNER, automation.id)).rejects.toThrow(NotFoundException);
      await expect(svc.rotateSecret(OTHER_OWNER, automation.id)).rejects.toThrow(NotFoundException);
      await expect(svc.listRuns(OTHER_OWNER, automation.id, {})).rejects.toThrow(NotFoundException);
      await expect(svc.getRun(OTHER_OWNER, run.id)).rejects.toThrow(NotFoundException);
      await expect(svc.retryRun(OTHER_OWNER, automation.id, run.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('runs', () => {
    it('lists the newest run as last_run and retries a failed run under the same id', async () => {
      const { w, svc } = owner();
      const { automation } = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      const run = w.repo.seedRun(OWNER, automation.id);
      const listed = await svc.list(OWNER);
      expect(listed.items[0]?.last_run).toMatchObject({ status: 'failed', status_word: 'Failed' });
      const history = await svc.listRuns(OWNER, automation.id, {});
      expect(history.items.map((r) => r.id)).toEqual([run.id]);
      const retried = await svc.retryRun(OWNER, automation.id, run.id);
      expect(retried).toMatchObject({ status: 'queued', run: { id: run.id } });
      // A second tap does nothing.
      expect(await svc.retryRun(OWNER, automation.id, run.id)).toMatchObject({
        status: 'already_queued',
      });
    });

    it('refuses a permanent failure', async () => {
      const { w, svc } = owner();
      const { automation } = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      const run = w.repo.seedRun(OWNER, automation.id, { retryable: false, lastError: 'http_404' });
      await expect(svc.retryRun(OWNER, automation.id, run.id)).rejects.toThrow('retry_not_allowed');
      expect((await svc.getRun(OWNER, run.id)).retry_allowed).toBe(false);
    });

    it('a run of another recipe is 404 under this recipe', async () => {
      const { w, svc } = owner();
      const a = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
      const b = await svc.create(OWNER, { recipe: 'sent_webhook', url: HOOK_URL });
      const run = w.repo.seedRun(OWNER, b.automation.id);
      await expect(svc.retryRun(OWNER, a.automation.id, run.id)).rejects.toThrow(NotFoundException);
    });
  });

  it('remove deletes the recipe', async () => {
    const { svc } = owner();
    const { automation } = await svc.create(OWNER, { recipe: 'sealed_webhook', url: HOOK_URL });
    await svc.remove(OWNER, automation.id);
    await expect(svc.get(OWNER, automation.id)).rejects.toThrow(NotFoundException);
  });
});
