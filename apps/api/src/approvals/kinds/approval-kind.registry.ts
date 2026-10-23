import { Injectable } from '@nestjs/common';
import type { ApprovalKind } from 'shared';
import { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import { EnvelopesService } from '../../envelopes/envelopes.service';
import { GDriveService } from '../../integrations/gdrive/gdrive.service';
import { AccessAuthService } from '../../signing/access-auth/access-auth.service';
import { SendGuardService } from '../send-guard.service';
import type { ApprovalKindHandler } from './approval-kind';
import { envelopeCancelKind, envelopeRemindKind, envelopeSendKind } from './envelope-kinds';
import { envelopeSaveToDriveKind, gdriveDisconnectKind } from './gdrive-kinds';
import { envelopeChangeExpiryKind, envelopeFixSignerKind } from './later-kinds';
import {
  accountDeleteKind,
  apiKeyCreateKind,
  apiKeyRevokeKind,
  approvalRequiredToggleKind,
  automationExternalDestinationKind,
  bulkSendKind,
  envelopeSignAsSignerKind,
} from './stub-kinds';

type AnyHandler = ApprovalKindHandler<Record<string, unknown>>;

/**
 * Every approval kind and its handler. A `Record<ApprovalKind, …>`, so a
 * kind added to `APPROVAL_KINDS` without a handler does not compile.
 * Handlers call the same services the HTTP controllers call.
 *
 * A work package that ships a stubbed action replaces its entry with
 * `register()` from its own module (WP-45 for the account and key
 * actions, WP-30 for automations), so it does not need to edit this file
 * or make this module import its module.
 */
@Injectable()
export class ApprovalKindRegistry {
  private readonly handlers: Record<ApprovalKind, AnyHandler>;

  constructor(
    envelopes: EnvelopesService,
    documents: EnvelopeDocumentsService,
    gdrive: GDriveService,
    guard: SendGuardService,
    accessAuth: AccessAuthService,
  ) {
    const env = { envelopes, documents, guard, accessAuth };
    const drive = { gdrive, envelopes };
    this.handlers = {
      envelope_send: erase(envelopeSendKind(env)),
      envelope_remind: erase(envelopeRemindKind(env)),
      envelope_cancel: erase(envelopeCancelKind(env)),
      gdrive_disconnect: erase(gdriveDisconnectKind(drive)),
      envelope_save_to_drive: erase(envelopeSaveToDriveKind(drive)),
      // WP-26 (MCP step 15). `bulk_send` is a stub until `McpModule` registers it.
      envelope_fix_signer: erase(envelopeFixSignerKind(env)),
      envelope_change_expiry: erase(envelopeChangeExpiryKind(env)),
      bulk_send: erase(bulkSendKind),
      automation_external_destination: erase(automationExternalDestinationKind),
      account_delete: erase(accountDeleteKind),
      api_key_create: erase(apiKeyCreateKind),
      api_key_revoke: erase(apiKeyRevokeKind),
      approval_required_toggle: erase(approvalRequiredToggleKind),
      envelope_sign_as_signer: erase(envelopeSignAsSignerKind),
    };
  }

  get(kind: ApprovalKind): AnyHandler {
    return this.handlers[kind];
  }

  /** Replace a kind's handler (a stub's owning work package, or a test). */
  register<A extends Record<string, unknown>>(handler: ApprovalKindHandler<A>): void {
    this.handlers[handler.kind] = erase(handler);
  }
}

function erase<A extends Record<string, unknown>>(handler: ApprovalKindHandler<A>): AnyHandler {
  return handler as AnyHandler;
}
