import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ReminderModule } from '../reminders/reminder.module';
import { SealingModule } from '../sealing/sealing.module';
import { CronController } from './cron.controller';

@Module({
  imports: [EnvelopesModule, ReminderModule, SealingModule],
  controllers: [CronController],
})
export class CronModule {}
