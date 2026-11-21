import { describe, expect, it } from 'vitest';
import type { ApprovalDetail } from 'shared';
import { NO_OUTCOME, approvedDetailFor, outcomeForRetry } from './approveOutcome';
import type { ApproveOutcome } from './approveOutcome';

const DETAIL = { id: 'apr-1' } as ApprovalDetail;

describe('approveOutcome', () => {
  it('a retry clears a refusal and the sign-in notice', () => {
    expect(outcomeForRetry({ kind: 'failed', message: 'No.' })).toEqual(NO_OUTCOME);
    expect(outcomeForRetry({ kind: 'needs-fresh' })).toEqual(NO_OUTCOME);
    expect(outcomeForRetry(NO_OUTCOME)).toEqual(NO_OUTCOME);
  });

  it('a retry keeps the Approve response and its one-time secret', () => {
    const approved: ApproveOutcome = { kind: 'approved', detail: DETAIL };
    expect(outcomeForRetry(approved)).toBe(approved);
  });

  it('hands back the approved detail only for the same approval', () => {
    const approved: ApproveOutcome = { kind: 'approved', detail: DETAIL };
    expect(approvedDetailFor(approved, 'apr-1')).toBe(DETAIL);
    expect(approvedDetailFor(approved, 'apr-2')).toBeNull();
    expect(approvedDetailFor({ kind: 'needs-fresh' }, 'apr-1')).toBeNull();
  });
});
