import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ApiKeysService } from '../../../api-keys/api-keys.service';
import { ApprovalKindRegistry } from '../../../approvals/kinds/approval-kind.registry';
import { MeService } from '../../../me/me.service';
import { ConnectedAppsService } from '../../oauth/connected-apps.service';
import { oauthGrantRevokeHandler } from '../connected-apps/connected-app-approval-kind';
import {
  apiKeyCreateHandler,
  apiKeyRevokeHandler,
  approvalRequiredToggleHandler,
} from '../api-keys/api-key-approval-kinds';
import { accountDeleteHandler, accountExportHandler } from './account-approval-kinds';

/**
 * WP-45: plugs the real account and key approval handlers into the kind
 * registry at boot, replacing the typed stubs that refused with
 * `approval_kind_not_ready`. Provided by `McpModule` (as WP-30's
 * automations registrar is), so neither the approvals module nor
 * `app.module.ts` imports the me or api-keys modules.
 */
@Injectable()
export class AccountApprovalRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: ApprovalKindRegistry,
    private readonly me: MeService,
    private readonly apiKeys: ApiKeysService,
    // WP-27's connected apps: the grant-revoke kind and the OAuth ceiling.
    private readonly apps: ConnectedAppsService,
  ) {}

  onModuleInit(): void {
    this.registry.register(accountDeleteHandler(this.me));
    this.registry.register(accountExportHandler());
    this.registry.register(apiKeyCreateHandler(this.apiKeys, this.apps));
    this.registry.register(oauthGrantRevokeHandler(this.apps));
    this.registry.register(apiKeyRevokeHandler(this.apiKeys));
    this.registry.register(approvalRequiredToggleHandler(this.apiKeys));
  }
}
