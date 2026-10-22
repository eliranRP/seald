import { Global, Module } from '@nestjs/common';
import { ApprovalLinkMinter } from './approval-link-minter.service';
import { ApprovalMailBreaker } from './approval-mail-breaker';
import { ApprovalsLifecycleService } from './approvals-lifecycle.service';
import { ApprovalsRepository } from './approvals.repository';
import { ApprovalsPgRepository } from './approvals.repository.pg';
import { ConfirmationsService } from './confirmations.service';

/**
 * The approval pieces other modules need without the envelope and Drive
 * services: the repository, the link minter the email dispatcher calls
 * at send time, revocation / account-deletion hooks, the send
 * confirmation token, and the mail breaker.
 *
 * `@Global()` so the global `EmailModule` can inject `ApprovalLinkMinter`
 * (optionally, like `AccessCodeMinter`) and `MeService` / `ApiKeysService`
 * the lifecycle hooks, without an import cycle.
 */
@Global()
@Module({
  providers: [
    { provide: ApprovalsRepository, useClass: ApprovalsPgRepository },
    ApprovalsLifecycleService,
    ApprovalLinkMinter,
    ConfirmationsService,
    ApprovalMailBreaker,
  ],
  exports: [
    ApprovalsRepository,
    ApprovalsLifecycleService,
    ApprovalLinkMinter,
    ConfirmationsService,
    ApprovalMailBreaker,
  ],
})
export class ApprovalsCoreModule {}
