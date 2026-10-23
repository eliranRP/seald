import { BadRequestException } from '@nestjs/common';
import { API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from '../../../approvals/kinds/approval-kind';
import type { MeService } from '../../../me/me.service';

const NoArgs = z.strictObject({});
type NoArgs = z.infer<typeof NoArgs>;

function accountSubject(subjectKey: string, ownerEmail: string): DescribedSubject {
  return {
    subjectKey,
    envelopeId: null,
    title: null,
    recipients: [],
    pageCount: null,
    destination: null,
    files: [],
    fields: [],
    facts: [{ label: 'Account', value: ownerEmail }],
  };
}

function sameAddress(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * `account_delete` (WP-45, D5) → the same `MeService.deleteAccount`
 * `DELETE /me` runs. The approval page repeats the irreversible-deletion
 * warning and Approve needs the account email typed by hand
 * (`confirm_email`, checked before anything is recorded) and a sign-in
 * from the last 10 minutes.
 *
 * Not transactional: deletion asks Supabase to delete the auth user, and
 * that cascade must not wait on the decision's row locks. The decision
 * commits first; deletion then removes the approval row with everything
 * else, and the page still gets Done.
 */
export function accountDeleteHandler(me: MeService): ApprovalKindHandler<NoArgs> {
  return {
    kind: 'account_delete',
    tool: 'account_delete',
    actionLabel: 'Delete your Seald account',
    ready: true,
    args: NoArgs,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    transactional: false,
    describe: async (_args, ctx) => accountSubject('account', ctx.ownerEmail),
    checkApproveBody(_args, body, ctx) {
      if (!body.confirm_email || !sameAddress(body.confirm_email, ctx.ownerEmail)) {
        throw new BadRequestException('confirmation_mismatch');
      }
    },
    async execute(_args, ctx) {
      await me.deleteAccount({ id: ctx.ownerId, email: ctx.ownerEmail, provider: null });
      return { deleted: true };
    },
  };
}

/**
 * `account_export` (WP-45, D5) → `GET /me/export`. The export holds
 * every personal record of the account, so it never goes to the agent:
 * after Approve the approval page offers the download in the owner's
 * own signed-in browser. Approve itself records only the decision.
 */
export function accountExportHandler(): ApprovalKindHandler<NoArgs> {
  return {
    kind: 'account_export',
    tool: 'account_export',
    actionLabel: 'Export your Seald data',
    ready: true,
    args: NoArgs,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    describe: async (_args, ctx) => accountSubject('account:export', ctx.ownerEmail),
    execute: async () => ({ export_ready: true }),
  };
}
