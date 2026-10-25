import { UnauthorizedException } from '@nestjs/common';
import type { AutomationWorkerService } from '../../automations/automation-worker.service';
import type { AutomationMatcherService } from '../../automations/matcher';
import type { BulkWorkerService } from '../../bulk/bulk-worker.service';
import type { AppEnv } from '../../config/env.schema';
import type { EmailDispatcherService } from '../../email/email-dispatcher.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import type { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import type { SealSweepService } from '../../sealing/seal-sweep.service';
import type { StepSweepService } from '../../signing/step-sweep.service';
import type { StagedUploadsService } from '../../uploads/staged-uploads.service';
import { CronController, TICK_LIMITS } from '../cron.controller';

/**
 * `tick` and `daily` stand in for the in-process loops on hosts with no
 * long-lived process (pg_cron -> Supabase Edge Function). Each pass is
 * bounded by TICK_LIMITS so one call stays inside a worker's CPU budget.
 */

const SECRET = 'c'.repeat(48);

function build(env: Partial<AppEnv> = {}) {
  const calls: string[] = [];
  const reminders = {
    enqueueDue: jest.fn(async (_now: Date, limit: number) => {
      calls.push(`reminders:${limit}`);
      return { queued: 0, skipped: 0 };
    }),
  };
  const bulk = {
    flushOnce: jest.fn(async (limit: number) => {
      calls.push(`bulk:${limit}`);
      return { claimed: 0, sent: 0, failed: 0, retried: 0 };
    }),
  };
  const worker = {
    flushOnce: jest.fn(async (limit: number) => {
      calls.push(`automations:${limit}`);
      return { claimed: 0, done: 0, retrying: 0, failed: 0 };
    }),
    maintenance: jest.fn(async () => {
      calls.push('maintenance');
    }),
  };
  const matcher = {
    rescan: jest.fn(async () => {
      calls.push('rescan');
      return { scanned: 0, matched: 0, runs: 0, failed: 0 };
    }),
    sweep: jest.fn(async () => {
      calls.push('sweep');
      return { deleted: 0, scanned: 0, matched: 0, runs: 0, failed: 0 };
    }),
  };
  const controller = new CronController(
    {} as EnvelopesService,
    {} as EmailDispatcherService,
    reminders as unknown as ReminderSchedulerService,
    {} as SealSweepService,
    {} as StepSweepService,
    { CRON_SECRET: SECRET, ...env } as AppEnv,
    {} as StagedUploadsService,
    bulk as unknown as BulkWorkerService,
    worker as unknown as AutomationWorkerService,
    matcher as unknown as AutomationMatcherService,
  );
  return { controller, calls };
}

describe('CronController tick / daily', () => {
  it('tick runs one bounded pass of reminders, bulk and automations', async () => {
    const { controller, calls } = build();
    const result = await controller.tick(SECRET);
    expect(calls).toEqual([
      `reminders:${TICK_LIMITS.reminders}`,
      `bulk:${TICK_LIMITS.bulkRows}`,
      'rescan',
      `automations:${TICK_LIMITS.automationRuns}`,
    ]);
    expect(result.bulk).not.toBeNull();
    expect(result.automations).not.toBeNull();
  });

  it('tick skips automations while AUTOMATIONS_DISABLED is true', async () => {
    const { controller, calls } = build({ AUTOMATIONS_DISABLED: true });
    const result = await controller.tick(SECRET);
    expect(result.automations).toBeNull();
    expect(calls).not.toContain('rescan');
  });

  it('daily runs the automation maintenance and the matcher sweep', async () => {
    const { controller, calls } = build();
    await controller.daily(SECRET);
    expect(calls).toEqual(['maintenance', 'sweep']);
  });

  it.each(['tick', 'daily'] as const)('%s rejects a wrong secret', async (route) => {
    const { controller, calls } = build();
    await expect(controller[route]('wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(calls).toEqual([]);
  });
});
