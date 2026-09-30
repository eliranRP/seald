import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysPgRepository } from './api-keys.repository.pg';
import { ApiKeysRepository } from './api-keys.repository';
import { ApiKeysService } from './api-keys.service';

/**
 * Agent access keys. EmailModule is global, so the created-key notice
 * can use OutboundEmailsRepository without an extra import.
 */
@Module({
  imports: [AuthModule],
  controllers: [ApiKeysController],
  providers: [ApiKeysService, { provide: ApiKeysRepository, useClass: ApiKeysPgRepository }],
  exports: [ApiKeysService, ApiKeysRepository],
})
export class ApiKeysModule {}
