import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ReminderSchedulerService } from './reminder-scheduler.service';
import { ReminderWorkerService } from './reminder-worker.service';

@Module({
  imports: [EnvelopesModule],
  providers: [ReminderSchedulerService, ReminderWorkerService],
  exports: [ReminderSchedulerService],
})
export class ReminderModule {}
