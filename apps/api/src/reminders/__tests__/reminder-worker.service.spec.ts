import type { AppEnv } from '../../config/env.schema';
import { ReminderSchedulerService, type ReminderSweepResult } from '../reminder-scheduler.service';
import { ReminderWorkerService } from '../reminder-worker.service';

function makeEnv(workerEnabled: boolean): AppEnv {
  return { WORKER_ENABLED: workerEnabled } as unknown as AppEnv;
}

function makeScheduler(impl: () => Promise<ReminderSweepResult>): ReminderSchedulerService {
  return { enqueueDue: jest.fn(impl) } as unknown as ReminderSchedulerService;
}

const empty: ReminderSweepResult = { queued: 0, skipped: 0, scanned: 0 };

describe('ReminderWorkerService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing when WORKER_ENABLED=false', async () => {
    const scheduler = makeScheduler(async () => empty);
    const worker = new ReminderWorkerService(scheduler, makeEnv(false));
    worker.onModuleInit();
    await Promise.resolve();
    expect(scheduler.enqueueDue).not.toHaveBeenCalled();
    await expect(worker.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('sweeps when enabled and stops on destroy', async () => {
    jest.useFakeTimers();
    const scheduler = makeScheduler(async () => empty);
    const worker = new ReminderWorkerService(scheduler, makeEnv(true));
    worker.onModuleInit();
    await Promise.resolve();
    await Promise.resolve();
    expect(scheduler.enqueueDue).toHaveBeenCalledTimes(1);
    const destroy = worker.onModuleDestroy();
    jest.advanceTimersByTime(60_000);
    await destroy;
  });
});
