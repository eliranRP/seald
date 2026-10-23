import { AutomationsChangeOutputSchema, AutomationsUpsertRecipeInputSchema } from 'shared';
import type { z } from 'zod';
import type { UpsertRecipeInput } from '../../../automations/automations.service';
import { requestApproval } from '../../approval-pending';
import { defineWriteTool } from '../../tool';
import { AUTOMATION_FLAGS, AUTOMATION_WRITE_ANNOTATIONS } from './automations-annotations';

function toServiceInput(
  args: z.output<typeof AutomationsUpsertRecipeInputSchema>,
): UpsertRecipeInput {
  return {
    recipe: args.recipe,
    automationId: args.automation_id,
    name: args.name,
    scope: args.scope,
    templateId: args.template_id,
    url: args.url,
    payloadDetail: args.payload_detail,
    recipients: args.recipients,
  };
}

/** `automations_upsert_recipe` -> `AutomationsService.upsertRecipe` (automations A3). */
export const automationsUpsertRecipeTool = defineWriteTool({
  name: 'automations_upsert_recipe',
  title: 'Create or edit an automation',
  description:
    "Creates an automation from a catalog recipe (recipe) or edits one (automation_id). A recipe that stays inside Seald is on at once. A recipe that sends data outside Seald (a webhook url, signer data in the payload, or an address that is not the owner's mailbox) is saved OFF and the result is approval_pending: show review_url to the owner, never open it, then poll approvals_get; it only turns on if the owner approves. The webhook url and its signing secret are never returned: the owner reads and rotates the secret in Seald. Needs automations:write. Requires idempotency_key and dry_run.",
  step: 'step-a3',
  scopes: ['automations:write'],
  annotations: AUTOMATION_WRITE_ANNOTATIONS,
  requiresFlags: AUTOMATION_FLAGS,
  input: AutomationsUpsertRecipeInputSchema,
  output: AutomationsChangeOutputSchema,
  preview: async (args, { principal, services }) => ({
    ...(await services.automations.previewUpsert(principal.ownerId, toServiceInput(args), {
      requireApproval: true,
    })),
  }),
  handler: async (args, ctx) => {
    const ownerId = ctx.principal.ownerId;
    const creating = args.automation_id === undefined;
    const out = await ctx.services.automations.upsertRecipe(ownerId, toServiceInput(args), {
      requireApproval: true,
      now: ctx.now,
    });
    if (!out.needsApproval) return { status: 'saved' as const, automation: out.automation };
    try {
      const pending = await requestApproval(
        ctx,
        'automation_external_destination',
        'automations_upsert_recipe',
        { automation_id: out.automation.id },
      );
      return { ...pending, automation: { ...out.automation, awaiting_approval: true } };
    } catch (err) {
      // The approval could not be opened (unverified mailbox, key revoked,
      // limit). Do not leave a half-made recipe for a retry to duplicate.
      if (creating) await ctx.services.automations.remove(ownerId, out.automation.id);
      throw err;
    }
  },
});
