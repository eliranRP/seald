import { useCallback, useEffect, useState } from 'react';
import type { ApprovalApproveBody, ApprovalDetail } from 'shared';
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
import {
  approvalPath,
  freshSignInCopy,
  isOwnerActionKind,
  reviewPath,
} from '@/features/approvals/model';
import { OwnerActionDone } from '@/features/approvals/owner/OwnerActionDone';
import { OwnerActionPanel } from '@/features/approvals/owner/OwnerActionPanel';
import { useReauth } from '@/features/approvals/useReauth';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { useAuth } from '@/providers/AuthProvider';

/** Sentences for the WP-45 Approve refusals that record nothing (the owner can fix and retry). */
const APPROVE_REFUSALS: Readonly<Record<string, string>> = {
  confirmation_mismatch: 'That is not your account email. Type it exactly to delete the account.',
  consent_required: 'Tick each box to give your consent before you sign.',
  signature_required: 'Adopt your signature before you approve.',
  initials_required: 'Adopt your initials before you approve.',
  image_not_png_or_jpeg: 'That signature image could not be read. Adopt it again.',
  image_too_large: 'That signature image is too large. Adopt it again.',
};

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
  const [failed, setFailed] = useState<string | null>(null);
  // WP-45: the Approve response, which alone carries a minted secret.
  const [approved, setApproved] = useState<ApprovalDetail | null>(null);
  const reauthRequested = params.get('reauth') === '1';
  const { signOut } = useAuth();
  const onAccountDeleted = useCallback((): void => {
    signOut()
      .catch(() => undefined)
      .finally(() => {
        navigate('/signin', { replace: true });
      });
  }, [navigate, signOut]);

  // One job: honour `?reauth=1` from the queue by starting a fresh sign-in.
  useEffect(() => {
    if (reauthRequested) reauth().catch(() => undefined);
  }, [reauth, reauthRequested]);

  if (detail.isError && isNotFound(detail.error)) return <ApprovalsNotFound />;

  const queuePath = isMobile ? '/m/settings/approvals' : '/settings/approvals';

  const decide = (action: 'approve' | 'deny', body?: ApprovalApproveBody): void => {
    setNeedsFresh(false);
    setFailed(null);
    act.mutate(
      { id, action, ...(body ? { body } : {}) },
      {
        onSuccess: (detail) => {
          if (action === 'approve') setApproved(detail);
        },
        onError: (err) => {
          if (err.code === 'fresh_login_required') setNeedsFresh(true);
          else
            setFailed(
              APPROVE_REFUSALS[err.code ?? ''] ?? 'That did not go through. Please try again.',
            );
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
                  {freshSignInCopy(data.kind)}
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
              {failed ? <Notice role="alert">{failed}</Notice> : null}
              {isOwnerActionKind(data.kind) ? (
                <OwnerActionPanel
                  detail={data}
                  busy={busy === 'approve' || busy === 'deny' ? busy : null}
                  onApprove={(body) => {
                    decide('approve', body);
                  }}
                  onDeny={() => {
                    decide('deny');
                  }}
                />
              ) : (
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
              )}
            </>
          ) : (
            <>
              <ApprovalOutcome state={data.status} resultSlug={data.result_slug} />
              {data.status === 'done' && isOwnerActionKind(data.kind) ? (
                <OwnerActionDone
                  // Remount when the Approve response (with its one-time secret) lands.
                  key={approved?.reveal ? 'revealed' : 'plain'}
                  detail={approved?.id === data.id ? approved : data}
                  onAccountDeleted={onAccountDeleted}
                />
              ) : null}
            </>
          )}
          <BackLink to={queuePath}>All approvals</BackLink>
        </>
      ) : null}
    </ApprovalFrame>
  );
}
