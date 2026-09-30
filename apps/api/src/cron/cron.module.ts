import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { ReminderModule } from '../reminders/reminder.module';
import { CronController } from './cron.controller';

@Module({
  imports: [EnvelopesModule, ReminderModule],
  controllers: [CronController],
})
export class CronModule {}
