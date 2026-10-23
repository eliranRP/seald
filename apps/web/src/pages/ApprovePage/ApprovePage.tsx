import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import styled from 'styled-components';
import type { ApprovalCard as ApprovalCardData } from 'shared';
import { ApprovalActions } from '@/features/approvals/ApprovalActions';
import { ApprovalCard } from '@/features/approvals/ApprovalCard';
import { ApprovalFrame } from '@/features/approvals/ApprovalFrame';
import { ApprovalOutcome } from '@/features/approvals/ApprovalOutcome';
import { decideApproval, previewApproval } from '@/features/approvals/approvalsApi';
import type { ApprovalApiError } from '@/features/approvals/approvalsPublicClient';
import { isApprovalsEnabled, reviewPath, reviewPathFromUrl } from '@/features/approvals/model';
import { ApprovalsNotFound } from '@/features/approvals/ApprovalsNotFound';

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** The link token from `/approve#<token>`, or null when it is missing or malformed. */
export function tokenFromHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  return TOKEN_PATTERN.test(raw) ? raw : null;
}

const Notice = styled.p`
  margin: 0;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.warn[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

const Fine = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const InlineLink = styled(Link)`
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

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' }
  | { readonly kind: 'card'; readonly card: ApprovalCardData };

function noticeFor(err: ApprovalApiError): string {
  if (err.status === 429) return 'Too many tries. Wait a minute, then try again.';
  if (err.slug === 'csrf_invalid') return 'That did not go through. Please try again.';
  return 'Something went wrong. Please try again.';
}

/**
 * `/approve#<token>`: the standalone Approve / Deny page for the email link.
 *
 * Opening it never decides. The page reads the token from the fragment,
 * removes it from the address bar at once and keeps it only in memory, then
 * calls the preview (which returns the card and the CSRF value). A decision
 * is a separate POST from a button press. The token is never logged, never
 * put in a query key and never sent anywhere but those two request bodies.
 */
export function ApprovePage() {
  return isApprovalsEnabled() ? <ApprovePageBody /> : <ApprovalsNotFound />;
}

function ApprovePageBody() {
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [token] = useState(() => tokenFromHash(location.hash));
  const [view, setView] = useState<View>(
    token === null ? { kind: 'invalid' } : { kind: 'loading' },
  );
  const [busy, setBusy] = useState<'approve' | 'deny' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // One job: take the token out of the address bar.
  useEffect(() => {
    if (window.location.hash === '') return;
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, []);

  const loadCard = useCallback(async (): Promise<void> => {
    if (token === null) return;
    try {
      setView({ kind: 'card', card: await previewApproval(token) });
    } catch (err) {
      setView(
        (err as ApprovalApiError).status === 404 ? { kind: 'unavailable' } : { kind: 'error' },
      );
    }
  }, [token]);

  // One job: preview the link once. Each preview issues a fresh CSRF nonce
  // cookie, so a second one (a StrictMode re-run) could leave the cookie and
  // the card's CSRF value from different previews.
  const previewed = useRef(false);
  useEffect(() => {
    if (previewed.current) return;
    previewed.current = true;
    loadCard().catch(() => undefined);
  }, [loadCard]);

  const decide = useCallback(
    async (decision: 'approve' | 'deny', card: ApprovalCardData): Promise<void> => {
      if (token === null || !card.csrf) return;
      setBusy(decision);
      setNotice(null);
      try {
        const next = await decideApproval({ token, decision, csrf: card.csrf });
        if (next.state === 'pending') {
          await loadCard();
        } else {
          setView({ kind: 'card', card: next });
        }
      } catch (err) {
        const apiErr = err as ApprovalApiError;
        if (apiErr.slug === 'session_required') {
          setView({ kind: 'card', card: { ...card, approve_requires: 'session' } });
          setNotice('This request needs you to sign in before it can be approved.');
        } else if (apiErr.status === 404) {
          setView({ kind: 'unavailable' });
        } else {
          setNotice(noticeFor(apiErr));
          if (apiErr.slug === 'csrf_invalid') await loadCard();
        }
      } finally {
        setBusy(null);
      }
    },
    [loadCard, token],
  );

  const openReview = useCallback(
    (card: ApprovalCardData): void => {
      const path =
        reviewPathFromUrl(card.review_url) ??
        (card.approval_id ? reviewPath(card.approval_id) : null);
      if (path) navigate(path);
    },
    [navigate],
  );

  if (view.kind === 'unavailable') return <ApprovalsNotFound />;

  return (
    <ApprovalFrame title="Approve a request">
      {view.kind === 'loading' ? <Fine role="status">Loading the request…</Fine> : null}
      {view.kind === 'invalid' ? (
        <ApprovalOutcome state="expired">
          <Fine>The link looks incomplete. Open it again from the approval email.</Fine>
        </ApprovalOutcome>
      ) : null}
      {view.kind === 'error' ? (
        <Notice role="alert">
          We could not load this request. Check your connection and reload the page.
        </Notice>
      ) : null}
      {view.kind === 'card' ? (
        <CardView
          card={view.card}
          busy={busy}
          notice={notice}
          focusDeny={params.get('intent') === 'deny'}
          onDecide={(d) => {
            decide(d, view.card).catch(() => undefined);
          }}
          onReview={() => {
            openReview(view.card);
          }}
        />
      ) : null}
    </ApprovalFrame>
  );
}

export interface CardViewProps {
  readonly card: ApprovalCardData;
  readonly busy: 'approve' | 'deny' | null;
  readonly notice: string | null;
  readonly focusDeny: boolean;
  readonly onDecide: (decision: 'approve' | 'deny') => void;
  readonly onReview: () => void;
}

/** The card and its actions for one preview result. Exported for stories. */
export function CardView({ card, busy, notice, focusDeny, onDecide, onReview }: CardViewProps) {
  if (card.state !== 'pending') {
    return (
      <>
        {card.summary ? <ApprovalCard summary={card.summary} /> : null}
        <ApprovalOutcome state={card.state} resultSlug={card.result_slug}>
          {card.state === 'denied' ? (
            <InlineLink to="/settings/developers">Revoke this key</InlineLink>
          ) : null}
        </ApprovalOutcome>
      </>
    );
  }
  if (!card.summary) return null;
  return (
    <>
      <ApprovalCard
        summary={card.summary}
        fieldsUpdatedAt={card.fields_updated_at}
        expiresAt={card.expires_at}
      />
      {notice ? <Notice role="alert">{notice}</Notice> : null}
      <ApprovalActions
        approveRequires={card.approve_requires ?? 'session'}
        busy={busy}
        focusDeny={focusDeny}
        onApprove={() => {
          onDecide('approve');
        }}
        onDeny={() => {
          onDecide('deny');
        }}
        onReview={card.approval_id ? onReview : undefined}
      />
      <Fine>Only approve a request you expected. Denying never needs a sign-in.</Fine>
    </>
  );
}
