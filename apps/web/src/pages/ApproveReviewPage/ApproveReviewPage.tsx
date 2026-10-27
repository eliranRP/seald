import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { needsSignInToApprove } from '@/features/approvals/signInFreshness';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { ApprovalFrame } from '@/features/approvals/ApprovalFrame';
import { ApprovalOutcome } from '@/features/approvals/ApprovalOutcome';
import { ApprovalsNotFound } from '@/features/approvals/ApprovalsNotFound';
import {
  isNotFound,
  useApprovalAction,
  useApprovalDetail,
} from '@/features/approvals/approvalsApi';
import { approvalPath, isOwnerActionKind, reviewPath } from '@/features/approvals/model';
import { ApprovalReview } from '@/features/approvals/review/ApprovalReview';
import { useDocumentTitle } from '@/features/approvals/useDocumentTitle';
import { useReauth } from '@/features/approvals/useReauth';
import { envelopeKeys, useEnvelopeQuery } from '@/features/envelopes';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';

/** Set when the owner opens the field editor from the review; read once on return. */
const EDITING_KEY = 'seald.approval.editing';

function readEditingFlag(): string | null {
  try {
    return window.sessionStorage.getItem(EDITING_KEY);
  } catch {
    return null;
  }
}

function writeEditingFlag(id: string | null): void {
  try {
    if (id === null) window.sessionStorage.removeItem(EDITING_KEY);
    else window.sessionStorage.setItem(EDITING_KEY, id);
  } catch {
    /* sessionStorage can be blocked; the refresh then happens on the next Approve */
  }
}

/**
 * `/approve/:id/review`: the signed-in guided review (step 7d). Only the
 * approval's owner gets it; anyone else sees not found. Approve here is the
 * session's Approve (`POST /approvals/:id/approve`), which needs a sign-in
 * from the last 12 hours and retires the email link.
 */
export function ApproveReviewPage() {
  const { id = '' } = useParams<{ id: string }>();
  useDocumentTitle('Review fields');
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobileViewport();
  const detail = useApprovalDetail(id);
  const envelopeId = detail.data?.envelope_id ?? '';
  const envelope = useEnvelopeQuery(envelopeId, envelopeId !== '');
  const act = useApprovalAction();
  const { session } = useAuth();
  const [failed, setFailed] = useState(false);
  const step = Number(params.get('page')) || 1;
  const reauth = useReauth(`${reviewPath(id)}?page=${step}`);

  // One job: after the owner edited fields in the editor and came back,
  // tell the server (a no-op when nothing changed) and reload the envelope.
  const { mutate: refresh } = act;
  useEffect(() => {
    if (readEditingFlag() !== id) return;
    writeEditingFlag(null);
    refresh({ id, action: 'refresh' });
    qc.invalidateQueries({ queryKey: envelopeKeys.details() }).catch(() => undefined);
  }, [id, qc, refresh]);

  if (detail.isError && isNotFound(detail.error)) return <ApprovalsNotFound />;

  const data = detail.data;
  // WP-45: the owner actions have no field review; their page is the card.
  if (data && isOwnerActionKind(data.kind)) return <Navigate to={approvalPath(id)} replace />;
  const backToCard = (): void => {
    navigate(approvalPath(id));
  };

  if (data && data.status !== 'pending') {
    return (
      <ApprovalFrame title="Review fields">
        <ApprovalOutcome state={data.status} resultSlug={data.result_slug} />
        <Link to={approvalPath(id)}>Back to the approval</Link>
      </ApprovalFrame>
    );
  }

  if (data && data.envelope_id === null) {
    return (
      <ApprovalFrame title="Review fields">
        <p>There is nothing to review for this request.</p>
        <Link to={approvalPath(id)}>Back to the approval</Link>
      </ApprovalFrame>
    );
  }

  if (!data || !envelope.data) {
    const failedLoad = detail.isError || envelope.isError;
    return (
      <ApprovalFrame title="Review fields">
        {failedLoad ? (
          <>
            <p role="alert">
              We could not load this review. Check your connection, then try again.
            </p>
            <div>
              <Button
                variant="secondary"
                loading={detail.isRefetching || envelope.isRefetching}
                onClick={() => {
                  if (detail.isError) detail.refetch().catch(() => undefined);
                  if (envelope.isError) envelope.refetch().catch(() => undefined);
                }}
              >
                Try again
              </Button>
            </div>
          </>
        ) : (
          <p role="status">Loading the review…</p>
        )}
      </ApprovalFrame>
    );
  }

  // Approve needs a recent sign-in; say so on the button up front.
  const needsSignIn = needsSignInToApprove(session);
  const signIn = (): void => {
    reauth().catch(() => undefined);
  };
  const approve = (): void => {
    if (needsSignIn) {
      signIn();
      return;
    }
    setFailed(false);
    act.mutate(
      { id, action: 'approve' },
      {
        onError: (err) => {
          // The server still says re-auth: go straight to sign-in.
          if (err.code === 'fresh_login_required') signIn();
          else setFailed(true);
        },
      },
    );
  };

  const edit = (): void => {
    writeEditingFlag(id);
    navigate(`/document/${data.envelope_id ?? ''}`);
  };

  const notice = failed ? <>That did not go through. Please try again.</> : null;

  return (
    <ApprovalReview
      envelope={envelope.data}
      actionLabel={data.summary.action_label}
      step={step}
      onStepChange={(next) => {
        setParams({ page: String(next) }, { replace: true });
      }}
      onApprove={approve}
      onEdit={isMobile ? undefined : edit}
      onExit={backToCard}
      busy={act.isPending && act.variables.action === 'approve'}
      notice={notice}
      approveLabel={needsSignIn ? 'Sign in to approve' : undefined}
      isMobile={isMobile}
    />
  );
}
