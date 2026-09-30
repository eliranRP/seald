import { Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { VerifyController } from './verify.controller';
import { VerifyService } from './verify.service';

@Module({
  imports: [EnvelopesModule],
  controllers: [VerifyController],
  providers: [VerifyService],
})
export class VerifyModule {}
