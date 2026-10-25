import { Module } from '@nestjs/common';
import { BulkModule } from '../bulk/bulk.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ReminderModule } from '../reminders/reminder.module';
import { SealingModule } from '../sealing/sealing.module';
import { UploadsModule } from '../uploads/uploads.module';
import { CronController } from './cron.controller';

@Module({
  imports: [BulkModule, EnvelopesModule, ReminderModule, SealingModule, UploadsModule],
  controllers: [CronController],
})
export class CronModule {}
