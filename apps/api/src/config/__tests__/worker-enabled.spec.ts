import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EmailDispatcherService } from '../../email/email-dispatcher.service';
import { EmailWorkerService } from '../../email/email-worker.service';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { ReminderSchedulerService } from '../../reminders/reminder-scheduler.service';
import { ReminderWorkerService } from '../../reminders/reminder-worker.service';
import { SealingService } from '../../sealing/sealing.service';
import { WorkerService } from '../../sealing/worker.service';
import { APP_ENV } from '../config.module';
import { parseEnv } from '../env.schema';

/**
 * WORKER_ENABLED is consumed by the seal worker (`WorkerService`), the
 * email worker (`EmailWorkerService`), and the reminder worker
 * (`ReminderWorkerService`). Each is a Nest provider whose
 * `onModuleInit` starts the poll loop. This boots them the same way the
 * app does — parsed env injected as APP_ENV, then module init — and
 * checks the string `"false"` neither starts those loops nor logs them
 * as starting.
 */
describe('WORKER_ENABLED=false', () => {
  const base = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_JWT_AUDIENCE: 'authenticated',
    CORS_ORIGIN: 'http://localhost:5173',
    APP_PUBLIC_URL: 'http://localhost:5173',
    DATABASE_URL: 'postgres://u:p@host:5432/db',
  };

  it('does not start or register the seal and email workers', async () => {
    const env = parseEnv({ ...base, WORKER_ENABLED: 'false' });
    expect(env.WORKER_ENABLED).toBe(false);

    const claimNextJob = jest.fn().mockResolvedValue(null);
    const enqueueDue = jest.fn().mockResolvedValue({ queued: 0, skipped: 0, scanned: 0 });
    const flushOnce = jest.fn().mockResolvedValue({
      claimed: 0,
      sent: 0,
      retried: 0,
      failed: 0,
      skipped: 0,
      outcomes: [],
    });
    const repo = Object.create(EnvelopesRepository.prototype) as EnvelopesRepository;
    repo.claimNextJob = claimNextJob;
    const dispatcher = Object.create(EmailDispatcherService.prototype) as EmailDispatcherService;
    dispatcher.flushOnce = flushOnce;
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        WorkerService,
        EmailWorkerService,
        ReminderWorkerService,
        { provide: APP_ENV, useValue: env },
        { provide: EnvelopesRepository, useValue: repo },
        {
          provide: SealingService,
          useValue: Object.create(SealingService.prototype) as SealingService,
        },
        { provide: EmailDispatcherService, useValue: dispatcher },
        {
          provide: ReminderSchedulerService,
          useValue: { enqueueDue } as unknown as ReminderSchedulerService,
        },
      ],
    }).compile();

    try {
      await moduleRef.init();

      expect(moduleRef.get(WorkerService)).toBeInstanceOf(WorkerService);
      expect(moduleRef.get(EmailWorkerService)).toBeInstanceOf(EmailWorkerService);
      expect(moduleRef.get(ReminderWorkerService)).toBeInstanceOf(ReminderWorkerService);
      expect(claimNextJob).not.toHaveBeenCalled();
      expect(flushOnce).not.toHaveBeenCalled();
      expect(enqueueDue).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith('Worker disabled by WORKER_ENABLED=false');
      expect(log).toHaveBeenCalledWith('EmailWorker disabled by WORKER_ENABLED=false');
      expect(log).toHaveBeenCalledWith('ReminderWorker disabled by WORKER_ENABLED=false');
      expect(log).not.toHaveBeenCalledWith('Worker starting');
      expect(log).not.toHaveBeenCalledWith('EmailWorker starting');
      expect(log).not.toHaveBeenCalledWith('ReminderWorker starting');
    } finally {
      await moduleRef.close();
    }
  });
});
