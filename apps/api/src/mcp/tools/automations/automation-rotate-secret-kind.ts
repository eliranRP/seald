import { ConflictException } from '@nestjs/common';
import { API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS, uuid } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from '../../../approvals/kinds/approval-kind';
import type { AutomationsService } from '../../../automations/automations.service';

const Args = z.strictObject({ automation_id: uuid });
type Args = z.infer<typeof Args>;

/**
 * `automation_rotate_secret` (WP-45, D5) → the same
 * `AutomationsService.rotateWebhookSecret` `POST /automations/:id/rotate-secret`
 * runs. The new signing secret goes to the approval page once (through
 * `revealOnce`), never to the agent, `result`, a log or an event. The old
 * secret keeps verifying for 24 hours, as in the app.
 */
export function automationRotateSecretHandler(svc: AutomationsService): ApprovalKindHandler<Args> {
  return {
    kind: 'automation_rotate_secret',
    tool: 'automations_rotate_secret',
    actionLabel: 'Rotate a webhook signing secret',
    ready: true,
    args: Args,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx): Promise<DescribedSubject> {
      const subject = await svc.describeForApproval(ctx.ownerId, args.automation_id);
      if (subject.destination.kind !== 'webhook') throw new ConflictException('not_a_webhook');
      return {
        subjectKey: `automation:${args.automation_id}:secret`,
        envelopeId: null,
        title: subject.name,
        recipients: [],
        pageCount: null,
        destination: subject.destination,
        files: [],
        fields: [],
        facts: [{ label: 'Old secret', value: 'Keeps working for 24 hours' }],
        extra: { destination_sha256: subject.destinationSha256 },
      };
    },
    async execute(args, ctx) {
      const rotated = await svc.rotateWebhookSecret(ctx.ownerId, args.automation_id, ctx.now);
      ctx.revealOnce?.({ automation_secret: rotated.secret });
      return {
        automation_id: args.automation_id,
        previous_retires_at: rotated.previousRetiresAt.toISOString(),
      };
    },
  };
}
