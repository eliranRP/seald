import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { TemplatesModule } from '../templates/templates.module';
import { DirectLinkRateLimiter } from './direct-link-rate-limiter';
import { DirectLinksOwnerController } from './direct-links-owner.controller';
import { DirectLinksPublicController } from './direct-links-public.controller';
import { DirectLinksRepository } from './direct-links.repository';
import { DirectLinksPgRepository } from './direct-links.repository.pg';
import { DirectLinksService } from './direct-links.service';

/**
 * WP-37 template direct links. Dark behind `directLinks`: every route 404s
 * while it is off. SigningModule is @Global, so SigningOrderService and
 * AccessAuthService come from there.
 */
@Module({
  imports: [AuthModule, EnvelopesModule, TemplatesModule],
  controllers: [DirectLinksOwnerController, DirectLinksPublicController],
  providers: [
    DirectLinksService,
    DirectLinkRateLimiter,
    { provide: DirectLinksRepository, useClass: DirectLinksPgRepository },
  ],
})
export class DirectLinksModule {}
