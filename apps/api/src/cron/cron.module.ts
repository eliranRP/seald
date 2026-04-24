import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { CronController } from './cron.controller';

@Module({
  imports: [EnvelopesModule],
  controllers: [CronController],
})
export class CronModule {}
