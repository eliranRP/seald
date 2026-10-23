import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApprovalsListOutputSchema, type ApiKeyScope } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import type { McpServices } from '../../../mcp-services';
import { McpToolRunner } from '../../../tool-runner';
import { OWNER, errorOf, okOf, principal } from '../../__tests__/harness';

const APPROVAL = '00000000-0000-4000-8000-000000000101';

function runner(calls: Array<{ owner: string; query: unknown }>): McpToolRunner {
  const approvals = {
    listForAgent: async (owner: string, query: unknown) => {
      calls.push({ owner, query });
      return {
        items: [
          {
            approval_id: APPROVAL,
            tool: 'envelopes_send',
            status: 'pending',
            requested_at: '2026-10-22T10:00:00.000Z',
            expires_at: '2026-10-23T10:00:00.000Z',
            review_url: 'https://seald.test/approve/x/review',
          },
        ],
        next_cursor: null,
      };
    },
  };
  return new McpToolRunner({ approvals } as unknown as McpServices);
}

async function call(
  args: Record<string, unknown>,
  scopes: readonly ApiKeyScope[] = ['envelopes:read'],
  calls: Array<{ owner: string; query: unknown }> = [],
): Promise<CallToolResult> {
  return runner(calls).call('approvals_list', args, principal(scopes), new Date());
}

describe('approvals_list', () => {
  it("lists this owner's approvals with status only; the schema drops any review path", async () => {
    const calls: Array<{ owner: string; query: unknown }> = [];
    const out = okOf(await call({ status: 'pending', limit: 5 }, ['envelopes:read'], calls));
    expect(ApprovalsListOutputSchema.safeParse(out).success).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/review|approve#|csrf/);
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(calls).toEqual([{ owner: OWNER, query: { status: 'pending', limit: 5 } }]);
  });

  it('rejects an unknown status, a limit over 50 and an unknown field (no required field)', async () => {
    for (const args of [{ status: 'approved' }, { limit: 51 }, { owner_id: OWNER }]) {
      expect(errorOf(await call(args)).slug).toBe('validation_error');
    }
    expect(okOf(await call({}))).toHaveProperty('items');
  });

  it('is insufficient_scope without envelopes:read', async () => {
    expect(errorOf(await call({}, [])).slug).toBe('insufficient_scope');
  });
});
