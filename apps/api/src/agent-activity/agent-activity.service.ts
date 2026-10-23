import { BadRequestException, Injectable } from '@nestjs/common';
import type { AgentActivityItem, AgentActivityResponse } from 'shared';
import { AgentActivityRepository, type ActivityCursor } from './agent-activity.repository';

export const ACTIVITY_LIMIT_DEFAULT = 20;
export const ACTIVITY_LIMIT_MAX = 50;

export function encodeActivityCursor(c: ActivityCursor): string {
  return Buffer.from(`${c.at}|${c.id}`, 'utf8').toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeActivityCursor(raw: string): ActivityCursor {
  const text = Buffer.from(raw, 'base64url').toString('utf8');
  const [at, id, ...rest] = text.split('|');
  if (rest.length > 0 || !at || !id || !UUID.test(id) || Number.isNaN(Date.parse(at))) {
    throw new BadRequestException('invalid_cursor');
  }
  return { at, id };
}

/**
 * Newest first; ties on time break on the larger id, matching the SQL row
 * comparison. `at` is fixed-width UTC text with microseconds, so comparing
 * the strings compares the instants.
 */
function newerFirst(a: AgentActivityItem, b: AgentActivityItem): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * What each key did for one owner (docs/design/mcp-server.md § Later: the
 * agent activity list, WP-26): the writes that carry `metadata.mcp` plus
 * the approvals a key asked for. Owner scoped; the controller is session
 * only, so an API key never reads it.
 */
@Injectable()
export class AgentActivityService {
  constructor(private readonly repo: AgentActivityRepository) {}

  async list(
    ownerId: string,
    query: { readonly limit?: number | undefined; readonly cursor?: string | undefined },
    now: Date = new Date(),
  ): Promise<AgentActivityResponse> {
    const limit = Math.min(Math.max(query.limit ?? ACTIVITY_LIMIT_DEFAULT, 1), ACTIVITY_LIMIT_MAX);
    const before = query.cursor === undefined ? null : decodeActivityCursor(query.cursor);
    // One more than a page from each source: the merge can take all of one.
    const [events, approvals] = await Promise.all([
      this.repo.listEvents(ownerId, before, limit + 1),
      this.repo.listApprovals(ownerId, before, limit + 1, now),
    ]);
    const merged = [...events, ...approvals].sort(newerFirst);
    const page = merged.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page,
      next_cursor:
        merged.length > limit && last ? encodeActivityCursor({ at: last.at, id: last.id }) : null,
    };
  }
}
