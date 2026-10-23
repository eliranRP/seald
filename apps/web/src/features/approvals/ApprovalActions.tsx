import styled from 'styled-components';
import { Button } from '@/components/Button';

const Row = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};

  @media (min-width: 641px) {
    flex-direction: row;
    flex-wrap: wrap;
  }
`;

export interface ApprovalActionsProps {
  /** `session`: Approve needs a sign-in, so the main button says so. */
  readonly approveRequires: 'link' | 'session';
  readonly busy: 'approve' | 'deny' | null;
  readonly onApprove: () => void;
  readonly onDeny: () => void;
  /** Opens the signed-in guided review. Omitted when there is nothing to review. */
  readonly onReview?: (() => void) | undefined;
  /** `?intent=deny` pre-focuses Deny. It never acts by itself. */
  readonly focusDeny?: boolean | undefined;
}

/**
 * Approve and Deny as the two main buttons, "Review fields" under them
 * when Approve is login-free. A request that needs a session says
 * "Sign in to approve" and goes to the review, which signs in first.
 */
export function ApprovalActions({
  approveRequires,
  busy,
  onApprove,
  onDeny,
  onReview,
  focusDeny = false,
}: ApprovalActionsProps) {
  const needsSession = approveRequires === 'session';
  const mainHandler = needsSession && onReview ? onReview : onApprove;
  return (
    <>
      <Row>
        <Button
          size="lg"
          variant="primary"
          loading={busy === 'approve'}
          disabled={busy === 'deny'}
          onClick={mainHandler}
        >
          {needsSession ? 'Sign in to approve' : 'Approve'}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          loading={busy === 'deny'}
          disabled={busy === 'approve'}
          autoFocus={focusDeny}
          onClick={onDeny}
        >
          Deny
        </Button>
      </Row>
      {!needsSession && onReview ? (
        <Row>
          <Button size="lg" variant="ghost" onClick={onReview}>
            Review fields
          </Button>
        </Row>
      ) : null}
    </>
  );
}
