import { EnvelopesListEventsInputSchema, EnvelopesListEventsOutputSchema } from 'shared';
import { defineTool } from '../tool';

/**
 * `envelopes_list_events` → `EnvelopesService.listEvents` (the same call
 * as `GET /envelopes/:id/events`), paged by `EnvelopeQueriesService`.
 * Ships with step 6 so the read surface covers every read route (parity
 * plan D5). IP and user agent are not returned.
 */
export const envelopesListEventsTool = defineTool({
  name: 'envelopes_list_events',
  title: 'Audit events',
  description:
    'Lists the audit trail of one envelope, oldest first: event type, who acted (sender, signer, system), the signer id when there is one, and the time. Pass next_cursor back as cursor for the next page.',
  step: 'step-6',
  scopes: ['envelopes:read'],
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  input: EnvelopesListEventsInputSchema,
  output: EnvelopesListEventsOutputSchema,
  handler: async ({ envelope_id, limit, cursor }, { principal, services }) => {
    const page = await services.queries.listEvents(principal.ownerId, envelope_id, {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
    return {
      events: page.events.map((e) => ({
        id: e.id,
        event_type: e.event_type,
        actor_kind: e.actor_kind,
        signer_id: e.signer_id,
        created_at: e.created_at,
        metadata: e.metadata,
      })),
      next_cursor: page.next_cursor,
    };
  },
});
