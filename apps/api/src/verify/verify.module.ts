import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { VerifyController } from './verify.controller';

@Module({
  imports: [EnvelopesModule],
  controllers: [VerifyController],
})
export class VerifyModule {}
