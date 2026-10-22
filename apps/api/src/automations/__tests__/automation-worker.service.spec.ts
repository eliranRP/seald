import {
  AUTOMATION_MAX_ATTEMPTS,
  AUTOMATION_RECIPES,
  AUTOMATION_TRIGGERS,
  automationTriggerForEvent,
  type FeatureFlag,
} from 'shared';
import type { AppEnv } from '../../config/env.schema';
import { backoffMs } from '../../email/email-dispatcher.service';
import type { WebhookSecretsService } from '../actions/webhook/webhook-secrets.service';
import type { AutomationActionExecutors } from '../automation-actions';
import {
  AUTOMATION_WORKER_LOOP_ENABLED,
  AutomationWorkerService,
  MAINTENANCE_INTERVAL_MS,
  STALE_LOCK_MS,
} from '../automation-worker.service';
import type { AutomationsPgRepository, ClaimedAutomationJob } from '../automations.repository.pg';

function job(overrides: Partial<ClaimedAutomationJob> = {}): ClaimedAutomationJob {
  return {
    job_id: 'job-1',
    run_id: 'run-1',
    automation_id: 'auto-1',
    attempts: 1,
    max_attempts: AUTOMATION_MAX_ATTEMPTS,
    owner_id: 'owner-1',
    envelope_id: 'env-1',
    event_id: 'evt-1',
    signer_id: null,
    trigger: 'envelope_sealed',
    action: 'webhook',
    config: {},
    ...overrides,
  };
}

function mockRepo() {
  return {
    claimNextJob: jest.fn<Promise<ClaimedAutomationJob | null>, [Date, Date]>(),
    completeRun: jest.fn().mockResolvedValue(undefined),
    retryRun: jest.fn().mockResolvedValue(undefined),
    failRun: jest.fn().mockResolvedValue(undefined),
  };
}

const ENV = { WORKER_ENABLED: true, AUTOMATIONS_DISABLED: false } as AppEnv;
const NOW = new Date('2026-10-22T12:00:00.000Z');
const base = { job_id: 'job-1', run_id: 'run-1', automation_id: 'auto-1' };

function worker(repo: ReturnType<typeof mockRepo>, executors?: AutomationActionExecutors) {
  return new AutomationWorkerService(repo as unknown as AutomationsPgRepository, ENV, executors);
}

describe('AutomationWorkerService', () => {
  describe('loop gating (WP-29 turns the loop on)', () => {
    type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
    const host = globalThis as unknown as OverrideHost;
    afterEach(() => {
      delete host.__SEALD_FEATURE_OVERRIDES__;
    });

    function gated(env: Partial<AppEnv>, flag: boolean): boolean {
      host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: flag };
      const w = new AutomationWorkerService(
        mockRepo() as unknown as AutomationsPgRepository,
        env as AppEnv,
      );
      return w.loopShouldRun();
    }

    it('the loop constant is on', () => {
      expect(AUTOMATION_WORKER_LOOP_ENABLED).toBe(true);
    });

    it('runs only with the flag on, WORKER_ENABLED, and the kill switch off', () => {
      expect(gated({ WORKER_ENABLED: true, AUTOMATIONS_DISABLED: false }, true)).toBe(true);
      expect(gated({ WORKER_ENABLED: true }, true)).toBe(true);
      expect(gated({ WORKER_ENABLED: true, AUTOMATIONS_DISABLED: false }, false)).toBe(false);
      expect(gated({ WORKER_ENABLED: false, AUTOMATIONS_DISABLED: false }, true)).toBe(false);
      expect(gated({ WORKER_ENABLED: true, AUTOMATIONS_DISABLED: true }, true)).toBe(false);
    });

    it('does not start (no claim) while the flag is off', () => {
      host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false };
      const repo = mockRepo();
      worker(repo).onModuleInit();
      expect(repo.claimNextJob).not.toHaveBeenCalled();
    });

    it('the daily maintenance pass clears retired previous secrets at most once a day', async () => {
      const clear = jest.fn().mockResolvedValue(0);
      const w = new AutomationWorkerService(
        mockRepo() as unknown as AutomationsPgRepository,
        ENV,
        undefined,
        { clearRetiredPrevious: clear } as unknown as WebhookSecretsService,
      );
      await w.maintenance(NOW);
      await w.maintenance(new Date(NOW.getTime() + 60_000));
      expect(clear).toHaveBeenCalledTimes(1);
      await w.maintenance(new Date(NOW.getTime() + MAINTENANCE_INTERVAL_MS));
      expect(clear).toHaveBeenCalledTimes(2);
    });
  });

  it('a job whose action has no executor fails permanently with action_not_available', async () => {
    const repo = mockRepo();
    expect(await worker(repo).process(job({ action: 'slack' }), NOW)).toBe('failed');
    expect(repo.failRun).toHaveBeenCalledWith({
      ...base,
      slug: 'action_not_available',
      retryable: false,
      response_status: null,
    });
  });

  it('success marks the run done and keeps the status code only', async () => {
    const repo = mockRepo();
    const w = worker(repo, {
      webhook: { execute: async () => ({ kind: 'done', responseStatus: 204 }) },
    });
    expect(await w.process(job(), NOW)).toBe('done');
    expect(repo.completeRun).toHaveBeenCalledWith({ ...base, response_status: 204 });
  });

  it.each(Array.from({ length: AUTOMATION_MAX_ATTEMPTS - 1 }, (_, i) => i + 1))(
    'attempt %i of a temporary failure retries after backoffMs',
    async (attempts) => {
      const repo = mockRepo();
      const w = worker(repo, {
        webhook: {
          execute: async () => ({ kind: 'transient', slug: 'http_503', responseStatus: 503 }),
        },
      });
      expect(await w.process(job({ attempts }), NOW)).toBe('retrying');
      expect(repo.retryRun).toHaveBeenCalledWith({
        ...base,
        slug: 'http_503',
        response_status: 503,
        scheduled_for: new Date(NOW.getTime() + backoffMs(attempts)),
      });
    },
  );

  it('the eighth temporary failure is failed and retryable', async () => {
    const repo = mockRepo();
    const w = worker(repo, {
      webhook: { execute: async () => ({ kind: 'transient', slug: 'timeout' }) },
    });
    expect(await w.process(job({ attempts: AUTOMATION_MAX_ATTEMPTS }), NOW)).toBe('failed');
    expect(repo.failRun).toHaveBeenCalledWith({
      ...base,
      slug: 'timeout',
      retryable: true,
      response_status: null,
    });
  });

  it('a 404 is failed and not retryable', async () => {
    const repo = mockRepo();
    const w = worker(repo, {
      webhook: {
        execute: async () => ({ kind: 'permanent', slug: 'http_404', responseStatus: 404 }),
      },
    });
    expect(await w.process(job(), NOW)).toBe('failed');
    expect(repo.failRun).toHaveBeenCalledWith({
      ...base,
      slug: 'http_404',
      retryable: false,
      response_status: 404,
    });
  });

  it('retryAfterMs wins over a shorter backoff', async () => {
    const repo = mockRepo();
    const w = worker(repo, {
      gdrive_upload: {
        execute: async () => ({ kind: 'transient', slug: 'rate_limited', retryAfterMs: 3_600_000 }),
      },
    });
    await w.process(job({ action: 'gdrive_upload' }), NOW);
    expect(repo.retryRun.mock.calls[0]![0].scheduled_for).toEqual(
      new Date(NOW.getTime() + 3_600_000),
    );
  });

  it('an executor that throws is a transient action_error, with no upstream text stored', async () => {
    const repo = mockRepo();
    const w = worker(repo, {
      webhook: {
        execute: async () => {
          throw new Error('body from https://secret.example/hook?token=abc');
        },
      },
    });
    await w.process(job(), NOW);
    expect(repo.retryRun.mock.calls[0]![0].slug).toBe('action_error');
  });

  it('a stale job reclaimed past max_attempts finishes failed and retryable without running', async () => {
    const repo = mockRepo();
    const execute = jest.fn();
    const w = worker(repo, { webhook: { execute } });
    await w.process(job({ attempts: AUTOMATION_MAX_ATTEMPTS + 1 }), NOW);
    expect(execute).not.toHaveBeenCalled();
    expect(repo.failRun).toHaveBeenCalledWith({
      ...base,
      slug: 'attempts_exhausted',
      retryable: true,
    });
  });

  it('flushOnce claims with a 15-minute stale lock cutoff and stops when the queue is empty', async () => {
    const repo = mockRepo();
    repo.claimNextJob.mockResolvedValueOnce(job({ action: 'slack' })).mockResolvedValueOnce(null);
    const result = await worker(repo).flushOnce(10, () => NOW);
    expect(result).toEqual({ claimed: 1, done: 0, retrying: 0, failed: 1 });
    expect(repo.claimNextJob).toHaveBeenCalledWith(NOW, new Date(NOW.getTime() - STALE_LOCK_MS));
    expect(repo.claimNextJob).toHaveBeenCalledTimes(2);
  });
});

describe('automation recipe catalog (shared)', () => {
  it('maps exactly the six recipe event types', () => {
    expect(
      ['sealed', 'signed', 'declined', 'expired', 'viewed', 'sent'].map(automationTriggerForEvent),
    ).toEqual([
      'envelope_sealed',
      'signer_signed',
      'signer_declined',
      'envelope_expired',
      'envelope_viewed',
      'envelope_sent',
    ]);
    for (const t of ['created', 'all_signed', 'field_filled', 'reminder_sent', 'nope']) {
      expect(automationTriggerForEvent(t)).toBeNull();
    }
  });

  it('every recipe uses a known trigger and no recipe offers slack', () => {
    for (const r of Object.values(AUTOMATION_RECIPES)) {
      expect(AUTOMATION_TRIGGERS).toContain(r.trigger);
      expect(r.action).not.toBe('slack');
    }
    expect(AUTOMATION_RECIPES.sealed_save_drive).toMatchObject({
      trigger: 'envelope_sealed',
      action: 'gdrive_upload',
    });
    expect(AUTOMATION_RECIPES.sealed_webhook).toMatchObject({
      trigger: 'envelope_sealed',
      action: 'webhook',
    });
  });
});
