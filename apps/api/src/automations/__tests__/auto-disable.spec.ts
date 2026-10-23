import { AUTOMATION_MAX_ATTEMPTS, type FeatureFlag } from 'shared';
import type { AppEnv } from '../../config/env.schema';
import type { InsertOutboundEmailInput } from '../../email/outbound-emails.repository';
import {
  AUTO_DISABLE_REASON,
  AUTO_DISABLE_THRESHOLD,
  AutoDisableService,
  AutoDisableStore,
  autoDisableDedupeKey,
  buildAutoDisableNotice,
  type AutoDisableContext,
} from '../auto-disable';
import type { AutomationActionExecutors } from '../automation-actions';
import { AutomationWorkerService } from '../automation-worker.service';
import type { AutomationsPgRepository, ClaimedAutomationJob } from '../automations.repository.pg';

/**
 * In-memory stand-in for `PgAutoDisableStore`. It follows the same contract:
 * flip only an enabled recipe at or above the threshold, and queue the
 * notice once per dedupe key. `automations-auto-disable.pg.e2e-spec.ts`
 * runs the same cases against the real SQL.
 */
interface FakeRecipe {
  readonly id: string;
  readonly ownerId: string;
  readonly ownerEmail: string | null;
  readonly name: string;
  enabled: boolean;
  consecutiveFailures: number;
  disabledAt: Date | null;
  disabledReason: string | null;
}

class FakeAutoDisableStore extends AutoDisableStore {
  readonly recipes = new Map<string, FakeRecipe>();
  readonly outbox: InsertOutboundEmailInput[] = [];
  private readonly keys = new Set<string>();

  add(
    recipe: Omit<FakeRecipe, 'consecutiveFailures' | 'disabledAt' | 'disabledReason' | 'enabled'>,
  ): void {
    this.recipes.set(recipe.id, {
      ...recipe,
      enabled: true,
      consecutiveFailures: 0,
      disabledAt: null,
      disabledReason: null,
    });
  }

  /** What `failRun` does to the counter. */
  bump(id: string): void {
    const r = this.mustGet(id);
    r.consecutiveFailures += 1;
  }

  /** What `completeRun` does: a success resets the streak. */
  succeed(id: string): void {
    this.mustGet(id).consecutiveFailures = 0;
  }

  /** What the crud `update` does on `enabled: true`. */
  reEnable(id: string): void {
    const r = this.mustGet(id);
    r.enabled = true;
    r.consecutiveFailures = 0;
    r.disabledAt = null;
    r.disabledReason = null;
  }

  async disableAtThreshold(input: {
    readonly automationId: string;
    readonly threshold: number;
    readonly now: Date;
    readonly notice: (ctx: AutoDisableContext) => InsertOutboundEmailInput | null;
  }): Promise<boolean> {
    const r = this.recipes.get(input.automationId);
    if (!r || !r.enabled || r.consecutiveFailures < input.threshold) return false;
    r.enabled = false;
    r.disabledAt = input.now;
    r.disabledReason = AUTO_DISABLE_REASON;
    const notice = input.notice({
      automationId: r.id,
      ownerId: r.ownerId,
      ownerEmail: r.ownerEmail,
      name: r.name,
      disabledAt: input.now,
      failureCount: r.consecutiveFailures,
    });
    if (notice && !this.keys.has(notice.dedupe_key ?? '')) {
      this.keys.add(notice.dedupe_key ?? '');
      this.outbox.push(notice);
    }
    return true;
  }

  private mustGet(id: string): FakeRecipe {
    const r = this.recipes.get(id);
    if (!r) throw new Error(`no recipe ${id}`);
    return r;
  }
}

const ENV = {
  APP_PUBLIC_URL: 'https://seald.nromomentum.com/',
  AUTOMATIONS_DISABLED: false,
  WORKER_ENABLED: true,
} as AppEnv;
const ID = '6f1c2d3e-0000-4000-8000-000000000001';
const OWNER_EMAIL = 'owner@example.com';

type OverrideHost = { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> };
const host = globalThis as unknown as OverrideHost;

function setup(opts: { ownerEmail?: string | null } = {}) {
  const store = new FakeAutoDisableStore();
  store.add({
    id: ID,
    ownerId: 'owner-1',
    ownerEmail: opts.ownerEmail === undefined ? OWNER_EMAIL : opts.ownerEmail,
    name: 'Save to Drive',
  });
  const service = new AutoDisableService(store, ENV);
  /** One failed run, as `failRun` then the A8 check would do it. */
  const fail = async (at: Date): Promise<boolean> => {
    store.bump(ID);
    return service.afterFailure(ID, at);
  };
  return { store, service, fail };
}

describe('A8 auto-disable', () => {
  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: true };
  });
  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  const T0 = new Date('2026-10-23T09:00:00.000Z');

  it('the threshold is twenty consecutive failures', () => {
    expect(AUTO_DISABLE_THRESHOLD).toBe(20);
  });

  it('19 failures leave the recipe on and queue no email', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 19; i += 1) {
      expect(await fail(new Date(T0.getTime() + i))).toBe(false);
    }
    const r = store.recipes.get(ID)!;
    expect(r.enabled).toBe(true);
    expect(r.consecutiveFailures).toBe(19);
    expect(r.disabledAt).toBeNull();
    expect(store.outbox).toHaveLength(0);
  });

  it('the 20th failure disables the recipe, records why and when, and queues one notice', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 19; i += 1) await fail(T0);
    expect(await fail(T0)).toBe(true);

    const r = store.recipes.get(ID)!;
    expect(r.enabled).toBe(false);
    expect(r.disabledAt).toEqual(T0);
    expect(r.disabledReason).toBe('consecutive_failures');
    expect(r.consecutiveFailures).toBe(20);

    expect(store.outbox).toHaveLength(1);
    const mail = store.outbox[0]!;
    expect(mail.kind).toBe('automation_disabled');
    expect(mail.to_email).toBe(OWNER_EMAIL);
    expect(mail.dedupe_key).toBe(`automation_disabled:${ID}:2026-10-23T09:00:00.000Z`);
    expect(mail.payload).toEqual({
      automation_name: 'Save to Drive',
      failure_count: 20,
      disabled_at_readable: '2026-10-23 09:00 UTC',
      settings_url: 'https://seald.nromomentum.com/settings/automations',
      public_url: 'https://seald.nromomentum.com',
    });
  });

  it('a failure after the disable, from a job already claimed, does not mail again', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 20; i += 1) await fail(T0);
    expect(await fail(T0)).toBe(false);
    expect(await fail(T0)).toBe(false);
    expect(store.outbox).toHaveLength(1);
    expect(store.recipes.get(ID)!.enabled).toBe(false);
  });

  it('a success resets the streak, so the count starts again', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 19; i += 1) await fail(T0);
    store.succeed(ID);
    for (let i = 0; i < 19; i += 1) await fail(T0);
    expect(store.recipes.get(ID)!.enabled).toBe(true);
    expect(store.outbox).toHaveLength(0);
    expect(await fail(T0)).toBe(true);
    expect(store.recipes.get(ID)!.enabled).toBe(false);
  });

  it('re-enabling resets the streak and clears the disable record', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 20; i += 1) await fail(T0);
    store.reEnable(ID);
    const r = store.recipes.get(ID)!;
    expect(r.enabled).toBe(true);
    expect(r.consecutiveFailures).toBe(0);
    expect(r.disabledAt).toBeNull();
    expect(r.disabledReason).toBeNull();

    for (let i = 0; i < 19; i += 1) await fail(new Date(T0.getTime() + 60_000));
    expect(r.enabled).toBe(true);
    expect(store.outbox).toHaveLength(1);
  });

  it('a second disable later gets its own notice, keyed by the new disable time', async () => {
    const { store, fail } = setup();
    for (let i = 0; i < 20; i += 1) await fail(T0);
    store.reEnable(ID);
    const later = new Date('2026-10-24T09:00:00.000Z');
    for (let i = 0; i < 19; i += 1) await fail(later);
    expect(await fail(later)).toBe(true);
    expect(store.outbox).toHaveLength(2);
    expect(store.outbox[0]!.dedupe_key).not.toBe(store.outbox[1]!.dedupe_key);
  });

  it('an owner with no address is still turned off, with no notice queued', async () => {
    const { store, fail } = setup({ ownerEmail: null });
    for (let i = 0; i < 20; i += 1) await fail(T0);
    expect(store.recipes.get(ID)!.enabled).toBe(false);
    expect(store.outbox).toHaveLength(0);
  });

  it('does nothing while the automations flag is off', async () => {
    host.__SEALD_FEATURE_OVERRIDES__ = { workflowAutomations: false };
    const { store, fail } = setup();
    for (let i = 0; i < 25; i += 1) await fail(T0);
    expect(store.recipes.get(ID)!.enabled).toBe(true);
    expect(store.outbox).toHaveLength(0);
  });

  it('a store error is logged by name and does not throw out of the worker path', async () => {
    const store = new FakeAutoDisableStore();
    store.disableAtThreshold = async () => {
      throw new Error('connection reset with a secret in the message');
    };
    const service = new AutoDisableService(store, ENV);
    await expect(service.afterFailure(ID, T0)).resolves.toBe(false);
  });

  describe('buildAutoDisableNotice', () => {
    it('returns null without an address', () => {
      expect(
        buildAutoDisableNotice(
          {
            automationId: ID,
            ownerId: 'o',
            ownerEmail: null,
            name: 'n',
            disabledAt: T0,
            failureCount: 20,
          },
          'https://seald.nromomentum.com',
        ),
      ).toBeNull();
    });

    it('keys the dedupe on recipe and disable time, and carries no signing token', () => {
      expect(autoDisableDedupeKey(ID, T0)).toBe(
        `automation_disabled:${ID}:2026-10-23T09:00:00.000Z`,
      );
      const notice = buildAutoDisableNotice(
        {
          automationId: ID,
          ownerId: 'o',
          ownerEmail: OWNER_EMAIL,
          name: 'n',
          disabledAt: T0,
          failureCount: 20,
        },
        'https://seald.nromomentum.com',
      )!;
      expect(JSON.stringify(notice.payload)).not.toMatch(/token|sign_url|\?t=/i);
      expect(notice.to_name).toBe('');
    });
  });

  describe('worker wiring', () => {
    const job = (overrides: Partial<ClaimedAutomationJob> = {}): ClaimedAutomationJob => ({
      job_id: 'job-1',
      run_id: 'run-1',
      automation_id: ID,
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
    });

    /** A repo whose failRun bumps the fake counter, as the real one does. */
    function repoFor(store: FakeAutoDisableStore) {
      return {
        completeRun: jest.fn(async (input: { automation_id: string }) => {
          store.succeed(input.automation_id);
        }),
        retryRun: jest.fn().mockResolvedValue(undefined),
        failRun: jest.fn(async (input: { automation_id: string }) => {
          store.bump(input.automation_id);
        }),
      };
    }

    it('a permanent failure per run, twenty times, turns the recipe off through process()', async () => {
      const store = new FakeAutoDisableStore();
      store.add({ id: ID, ownerId: 'owner-1', ownerEmail: OWNER_EMAIL, name: 'Hook' });
      const repo = repoFor(store);
      const executors = {
        webhook: { execute: async () => ({ kind: 'permanent' as const, slug: 'http_404' }) },
      } as unknown as AutomationActionExecutors;
      const worker = new AutomationWorkerService(
        repo as unknown as AutomationsPgRepository,
        ENV,
        executors,
        undefined,
        new AutoDisableService(store, ENV),
      );

      for (let i = 0; i < 19; i += 1) {
        expect(await worker.process(job({ job_id: `j${i}` }), T0)).toBe('failed');
      }
      expect(store.recipes.get(ID)!.enabled).toBe(true);
      expect(store.outbox).toHaveLength(0);

      expect(await worker.process(job({ job_id: 'j19' }), T0)).toBe('failed');
      expect(store.recipes.get(ID)!.enabled).toBe(false);
      expect(store.outbox).toHaveLength(1);
      expect(repo.failRun).toHaveBeenCalledTimes(20);
    });

    it('a run that is only retrying does not count toward the streak', async () => {
      const store = new FakeAutoDisableStore();
      store.add({ id: ID, ownerId: 'owner-1', ownerEmail: OWNER_EMAIL, name: 'Hook' });
      const repo = repoFor(store);
      const executors = {
        webhook: { execute: async () => ({ kind: 'transient' as const, slug: 'timeout' }) },
      } as unknown as AutomationActionExecutors;
      const check = jest.spyOn(AutoDisableService.prototype, 'afterFailure');
      try {
        const worker = new AutomationWorkerService(
          repo as unknown as AutomationsPgRepository,
          ENV,
          executors,
          undefined,
          new AutoDisableService(store, ENV),
        );
        for (let i = 0; i < 25; i += 1) {
          expect(await worker.process(job({ job_id: `r${i}`, attempts: 1 }), T0)).toBe('retrying');
        }
        expect(repo.failRun).not.toHaveBeenCalled();
        expect(check).not.toHaveBeenCalled();
        expect(store.recipes.get(ID)!.enabled).toBe(true);
      } finally {
        check.mockRestore();
      }
    });
  });
});
