import { NotFoundException } from '@nestjs/common';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ApprovalsGetOutputSchema, type ApiKeyScope } from 'shared';
import { findTokenShapedStrings } from '../../../leak-scan';
import type { McpServices } from '../../../mcp-services';
import { McpToolRunner } from '../../../tool-runner';
import { OWNER, errorOf, okOf, principal } from '../../__tests__/harness';

const APPROVAL = '00000000-0000-4000-8000-000000000101';
const OTHER = '00000000-0000-4000-8000-000000000102';

function runner(calls: string[]): McpToolRunner {
  const approvals = {
    statusForAgent: async (owner: string, id: string) => {
      calls.push(`statusForAgent:${owner}:${id}`);
      if (owner !== OWNER || id !== APPROVAL) throw new NotFoundException('approval_not_found');
      // A stray field must not ride along: the output schema drops it.
      return { status: 'failed', result_slug: 'api_key_revoked', review_url: '/approve#x' };
    },
  };
  return new McpToolRunner({ approvals } as unknown as McpServices);
}

async function call(
  args: Record<string, unknown>,
  scopes: readonly ApiKeyScope[] = ['envelopes:read'],
  calls: string[] = [],
): Promise<CallToolResult> {
  return runner(calls).call('approvals_get', args, principal(scopes), new Date());
}

describe('approvals_get', () => {
  it('returns the status and, for failed, the slug — never a token or review path', async () => {
    const calls: string[] = [];
    const out = okOf(await call({ approval_id: APPROVAL }, ['envelopes:read'], calls));
    expect(out).toEqual({ status: 'failed', result_slug: 'api_key_revoked' });
    expect(ApprovalsGetOutputSchema.safeParse(out).success).toBe(true);
    expect(findTokenShapedStrings(out)).toEqual([]);
    expect(calls).toEqual([`statusForAgent:${OWNER}:${APPROVAL}`]);
  });

  it('rejects a missing id, a bad id and an unknown field', async () => {
    for (const args of [{}, { approval_id: 'x' }, { approval_id: APPROVAL, decide: 'approve' }]) {
      expect(errorOf(await call(args)).slug).toBe('validation_error');
    }
  });

  it('is insufficient_scope without envelopes:read', async () => {
    expect(errorOf(await call({ approval_id: APPROVAL }, [])).slug).toBe('insufficient_scope');
  });

  it("another owner's approval is not_found", async () => {
    expect(errorOf(await call({ approval_id: OTHER })).slug).toBe('approval_not_found');
  });
});
