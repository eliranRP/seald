import type { ApprovalsService } from '../../approvals/approvals.service';
import { requestApproval } from '../approval-pending';
import type { McpServices } from '../mcp-services';
import { principal } from '../tools/__tests__/harness';

describe('requestApproval (step 7c hook for approval-gated tools)', () => {
  it('asks with the credential owner and key, never with ids from the arguments', async () => {
    const seen: unknown[] = [];
    const approvals = {
      request: async (input: unknown) => {
        seen.push(input);
        return { status: 'approval_pending' };
      },
    } as unknown as ApprovalsService;
    const now = new Date('2026-10-22T12:00:00.000Z');
    const p = principal(['envelopes:send']);
    const out = await requestApproval(
      { principal: p, services: { approvals } as unknown as McpServices, now },
      'envelope_send',
      'envelopes_send',
      { envelope_id: '11111111-1111-4111-8111-111111111111', owner_id: 'someone-else' },
    );
    expect(out).toEqual({ status: 'approval_pending' });
    expect(seen).toEqual([
      {
        requester: { ownerId: p.ownerId, apiKeyId: p.keyId },
        kind: 'envelope_send',
        tool: 'envelopes_send',
        args: { envelope_id: '11111111-1111-4111-8111-111111111111', owner_id: 'someone-else' },
        now,
      },
    ]);
  });
});
