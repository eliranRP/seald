import { useInfiniteQuery } from '@tanstack/react-query';
import { AgentActivityResponseSchema, type AgentActivityResponse } from 'shared';
import { apiClient } from '@/lib/api/apiClient';

export const AGENT_ACTIVITY_KEY = ['me', 'agent-activity'] as const;

const PAGE_SIZE = 20;

/** A 404 (key surfaces off, or `MCP_DISABLED`) reads as `null`: the list is not available. */
async function fetchPage(cursor: string | undefined): Promise<AgentActivityResponse | null> {
  try {
    const res = await apiClient.get<unknown>('/agent-activity', {
      params: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    });
    return AgentActivityResponseSchema.parse(res.data);
  } catch (err) {
    if ((err as { status?: number }).status === 404) return null;
    throw err;
  }
}

/** What each key did, newest first, 20 a page. A `null` page means the API says not available. */
export function useAgentActivity() {
  return useInfiniteQuery({
    queryKey: AGENT_ACTIVITY_KEY,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchPage(pageParam),
    getNextPageParam: (last) => last?.next_cursor ?? undefined,
  });
}
