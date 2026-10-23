import type { AgentActivityItem } from 'shared';

/** A keyset position in the merged list: the row time and id of the last item. */
export interface ActivityCursor {
  readonly at: string;
  readonly id: string;
}

/**
 * Persistence port for the owner's agent activity list (WP-26). Both reads
 * are scoped to the owner and ordered newest first by `(at, id)`.
 */
export abstract class AgentActivityRepository {
  /**
   * Hash-chained events that carry `metadata.mcp`: what a key did. A send
   * writes one `sent` event per invitee, so only the first per envelope is
   * returned. Writes only: viewing is not an agent action.
   */
  abstract listEvents(
    ownerId: string,
    before: ActivityCursor | null,
    limit: number,
  ): Promise<readonly AgentActivityItem[]>;

  /**
   * Approvals a key asked for. A finished approval whose action wrote an
   * envelope event is left out (the event shows it); one whose action wrote
   * none (a bulk batch, a Drive action) is kept.
   */
  abstract listApprovals(
    ownerId: string,
    before: ActivityCursor | null,
    limit: number,
    now: Date,
  ): Promise<readonly AgentActivityItem[]>;
}
