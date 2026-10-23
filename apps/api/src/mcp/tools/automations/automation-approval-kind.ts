import { uuid } from 'shared';
import { z } from 'zod';
import type { ApprovalKindHandler, DescribedSubject } from '../../../approvals/kinds/approval-kind';
import type { AutomationsService } from '../../../automations/automations.service';

const Args = z.strictObject({ automation_id: uuid });
type Args = z.infer<typeof Args>;

/**
 * `automation_external_destination` (WP-30). Replaces the typed stub in
 * the kind registry. Approve turns the recipe on, through the same
 * `AutomationsService` an agent's change went through; nothing runs
 * before that, because an agent-made external recipe is saved disabled.
 *
 * Not high-risk: the design asks for the email-first link. The subject
 * hash covers a hash of the full destination, the recipe and the payload
 * detail, so an edit after the request expires the approval instead of
 * approving something the owner did not see.
 */
export function automationExternalDestinationHandler(
  svc: AutomationsService,
): ApprovalKindHandler<Args> {
  return {
    kind: 'automation_external_destination',
    tool: 'automations_upsert_recipe',
    actionLabel: 'Turn on an automation that sends data outside Seald',
    ready: true,
    args: Args,
    highRisk: () => false,
    async describe(args, ctx): Promise<DescribedSubject> {
      const subject = await svc.describeForApproval(ctx.ownerId, args.automation_id);
      return {
        subjectKey: `automation:${args.automation_id}`,
        envelopeId: null,
        title: subject.name,
        recipients: subject.recipients,
        pageCount: null,
        destination: subject.destination,
        files: [],
        fields: [],
        extra: {
          recipe: subject.recipe,
          destination_sha256: subject.destinationSha256,
          payload_detail: subject.payloadDetail,
        },
      };
    },
    async execute(args, ctx) {
      const automation = await svc.activateApproved(ctx.ownerId, args.automation_id);
      return { automation_id: automation.id, enabled: automation.enabled };
    },
  };
}
