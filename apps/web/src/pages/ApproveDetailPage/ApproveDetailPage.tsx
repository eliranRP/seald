import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { ApprovalActions } from '@/features/approvals/ApprovalActions';
import { ApprovalCard } from '@/features/approvals/ApprovalCard';
import { ApprovalFrame } from '@/features/approvals/ApprovalFrame';
import { ApprovalOutcome } from '@/features/approvals/ApprovalOutcome';
import { ApprovalsNotFound } from '@/features/approvals/ApprovalsNotFound';
import {
  isNotFound,
  useApprovalAction,
  useApprovalDetail,
} from '@/features/approvals/approvalsApi';
import { approvalPath, reviewPath } from '@/features/approvals/model';
import { useReauth } from '@/features/approvals/useReauth';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';

const Notice = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.warn[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

const Fine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const BackLink = styled(Link)`
  align-self: flex-start;
  color: ${({ theme }) => theme.color.accent.base};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

/**
 * `/approve/:id`: one approval for the signed-in owner. This is where a
 * stale session returns after signing in again, with Approve ready, and
 * where the queue and the bell lead. Another account's id is a 404 and
 * reads as not found.
 */
export function ApproveDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const isMobile = useIsMobileViewport();
  const detail = useApprovalDetail(id);
  const act = useApprovalAction();
  const reauth = useReauth(approvalPath(id));
  const [needsFresh, setNeedsFresh] = useState(false);
  const [failed, setFailed] = useState(false);
  const reauthRequested = params.get('reauth') === '1';

  // One job: honour `?reauth=1` from the queue by starting a fresh sign-in.
  useEffect(() => {
    if (reauthRequested) reauth().catch(() => undefined);
  }, [reauth, reauthRequested]);

  if (detail.isError && isNotFound(detail.error)) return <ApprovalsNotFound />;

  const queuePath = isMobile ? '/m/settings/approvals' : '/settings/approvals';

  const decide = (action: 'approve' | 'deny'): void => {
    setNeedsFresh(false);
    setFailed(false);
    act.mutate(
      { id, action },
      {
        onError: (err) => {
          if (err.code === 'fresh_login_required') setNeedsFresh(true);
          else setFailed(true);
        },
      },
    );
  };

  const data = detail.data;
  const busy = act.isPending ? act.variables.action : null;

  return (
    <ApprovalFrame title="Approval request">
      {detail.isPending ? <Fine role="status">Loading the request…</Fine> : null}
      {detail.isError && !isNotFound(detail.error) ? (
        <Notice role="alert">We could not load this request. Reload the page to try again.</Notice>
      ) : null}
      {data ? (
        <>
          <ApprovalCard
            summary={data.summary}
            fieldsUpdatedAt={data.fields_updated_at}
            {...(data.status === 'pending' ? { expiresAt: data.expires_at } : {})}
          />
          {data.status === 'pending' ? (
            <>
              {needsFresh ? (
                <Notice role="alert">
                  Approving needs a sign-in from the last 12 hours.
                  <Button
                    variant="secondary"
                    size="lg"
                    onClick={() => {
                      reauth().catch(() => undefined);
                    }}
                  >
                    Sign in again
                  </Button>
                </Notice>
              ) : null}
              {failed ? (
                <Notice role="alert">That did not go through. Please try again.</Notice>
              ) : null}
              <ApprovalActions
                approveRequires="link"
                busy={busy === 'approve' || busy === 'deny' ? busy : null}
                onApprove={() => {
                  decide('approve');
                }}
                onDeny={() => {
                  decide('deny');
                }}
                onReview={
                  data.envelope_id !== null
                    ? () => {
                        navigate(reviewPath(data.id));
                      }
                    : undefined
                }
              />
            </>
          ) : (
            <ApprovalOutcome state={data.status} resultSlug={data.result_slug} />
          )}
          <BackLink to={queuePath}>All approvals</BackLink>
        </>
      ) : null}
    </ApprovalFrame>
  );
}
