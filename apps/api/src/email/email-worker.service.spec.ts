import type { AppEnv } from '../config/env.schema';
import { EmailDispatcherService, type FlushResult } from './email-dispatcher.service';
import { EmailWorkerService } from './email-worker.service';

/**
 * Coverage for the in-process email queue drainer. Exercises the four
 * branches the consumer cares about:
 *
 *   - WORKER_ENABLED=false → never starts the loop (no flushOnce calls)
 *   - WORKER_ENABLED=true → drains the queue, sleeps when idle, exits
 *     cleanly on onModuleDestroy
 *   - flushOnce throws → swallowed + logged + retried after error delay
 *
 * Real timers would make these tests sleep 5-10 seconds each. We
 * jest.useFakeTimers and advance the clock manually.
 */

function makeEnv(workerEnabled: boolean): AppEnv {
  return { WORKER_ENABLED: workerEnabled } as unknown as AppEnv;
}

function makeDispatcher(impl: () => Promise<FlushResult>): EmailDispatcherService {
  return { flushOnce: jest.fn(impl) } as unknown as EmailDispatcherService;
}

const emptyResult: FlushResult = {
  claimed: 0,
  sent: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
  outcomes: [],
};

describe('EmailWorkerService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does nothing when WORKER_ENABLED=false', async () => {
    const dispatcher = makeDispatcher(async () => emptyResult);
    const worker = new EmailWorkerService(dispatcher, makeEnv(false));

    worker.onModuleInit();

    // No microtasks, no timers — the loop never started.
    await Promise.resolve();
    expect(dispatcher.flushOnce).not.toHaveBeenCalled();
    // onModuleDestroy is safe to call when nothing started.
    await expect(worker.onModuleDestroy()).resolves.toBeUndefined();
  });

  it('starts the loop when WORKER_ENABLED=true and exits cleanly on destroy', async () => {
    jest.useFakeTimers();
    const dispatcher = makeDispatcher(async () => emptyResult);
    const worker = new EmailWorkerService(dispatcher, makeEnv(true));

    worker.onModuleInit();
    // Yield once so the loop body runs (await flushOnce, hit sleep).
    await Promise.resolve();
    await Promise.resolve();
    expect(dispatcher.flushOnce).toHaveBeenCalledTimes(1);
    expect(dispatcher.flushOnce).toHaveBeenCalledWith(50);

    // Trigger destroy mid-sleep — the loop awaits the timer then sees
    // `stopping`. Drain the timer to let the loop notice.
    const destroy = worker.onModuleDestroy();
    jest.advanceTimersByTime(5000);
    await destroy;
  });

  it('loops immediately on a full batch (no idle sleep) and stops on destroy', async () => {
    // claimed === maxBatch (50) → loop body skips the idle sleep (only
    // pauses when the batch wasn't full). Asserting this branch by
    // counting flushOnce calls before destroy.
    jest.useFakeTimers();
    let calls = 0;
    const dispatcher = makeDispatcher(async () => {
      calls += 1;
      // After several full batches, switch to empty so the next iteration
      // hits the idle-sleep branch (covered by the previous test).
      if (calls >= 3) return emptyResult;
      return { ...emptyResult, claimed: 50, sent: 50 };
    });
    const worker = new EmailWorkerService(dispatcher, makeEnv(true));
    worker.onModuleInit();

    // Flush microtasks for the consecutive full-batch iterations.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(calls).toBeGreaterThanOrEqual(3);

    const destroy = worker.onModuleDestroy();
    jest.advanceTimersByTime(5000);
    await destroy;
  });

  it('swallows + retries when flushOnce throws (errorDelayMs gate)', async () => {
    jest.useFakeTimers();
    let calls = 0;
    const dispatcher = makeDispatcher(async () => {
      calls += 1;
      if (calls === 1) throw new Error('db_blip');
      return emptyResult;
    });
    const worker = new EmailWorkerService(dispatcher, makeEnv(true));
    worker.onModuleInit();

    // Let the first flushOnce reject + the catch handler schedule a 10s
    // sleep, then advance the clock past it so the loop runs again.
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBe(1);

    jest.advanceTimersByTime(10_000);
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toBeGreaterThanOrEqual(2);

    const destroy = worker.onModuleDestroy();
    jest.advanceTimersByTime(5000);
    await destroy;
  });
});
