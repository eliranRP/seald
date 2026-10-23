import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import type { ApprovalDetail, ApprovalStatus } from 'shared';
import { Badge, type BadgeTone } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { FilterTabs } from '@/components/FilterTabs';
import { isNotFound, useApprovalAction, useApprovalsQueue } from './approvalsApi';
import { ApprovalsNotFound } from './ApprovalsNotFound';
import { approvalPath, expiresInLabel, keyLine, reviewPath, STATUS_LABELS } from './model';

const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  width: 100%;
  max-width: 720px;
  margin-inline: auto;
`;

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

const Row = styled.li`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
`;

const RowHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[2]};
`;

const TitleLink = styled(Link)`
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  overflow-wrap: anywhere;
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;

const Meta = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const Actions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

const Alert = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;

const STATUS_TONE: Readonly<Record<ApprovalStatus, BadgeTone>> = {
  pending: 'amber',
  done: 'emerald',
  denied: 'neutral',
  expired: 'neutral',
  failed: 'red',
};

type Filter = 'pending' | 'all';

const TABS = [
  { id: 'pending', label: 'Waiting for you' },
  { id: 'all', label: 'All' },
] as const;

interface QueueRowProps {
  readonly item: ApprovalDetail;
}

function QueueRow({ item }: QueueRowProps) {
  const navigate = useNavigate();
  const act = useApprovalAction();
  const [error, setError] = useState<string | null>(null);
  const pending = item.status === 'pending';
  const busy = act.isPending ? act.variables.action : null;
  const title = item.summary.title ?? item.summary.action_label;

  const decide = (action: 'approve' | 'deny'): void => {
    setError(null);
    act.mutate(
      { id: item.id, action },
      {
        onError: (err) => {
          if (err.code === 'fresh_login_required') {
            // Sign-in plus one tap, back on this approval's card.
            navigate(`${approvalPath(item.id)}?reauth=1`);
          } else {
            setError('That did not go through. Please try again.');
          }
        },
      },
    );
  };

  return (
    <Row>
      <RowHead>
        <TitleLink to={approvalPath(item.id)}>{title}</TitleLink>
        <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABELS[item.status]}</Badge>
      </RowHead>
      <Meta>
        {item.summary.action_label} · {keyLine(item.summary.key_name)}
        {pending ? ` · ${expiresInLabel(item.expires_at)}` : ''}
      </Meta>
      {error ? <Alert role="alert">{error}</Alert> : null}
      {pending ? (
        <Actions>
          <Button
            variant="primary"
            size="lg"
            loading={busy === 'approve'}
            disabled={busy === 'deny'}
            onClick={() => {
              decide('approve');
            }}
            aria-label={`Approve ${title}`}
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="lg"
            loading={busy === 'deny'}
            disabled={busy === 'approve'}
            onClick={() => {
              decide('deny');
            }}
            aria-label={`Deny ${title}`}
          >
            Deny
          </Button>
          {item.envelope_id !== null ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => {
                navigate(reviewPath(item.id));
              }}
              aria-label={`Review fields for ${title}`}
            >
              Review fields
            </Button>
          ) : null}
        </Actions>
      ) : null}
    </Row>
  );
}

/**
 * The in-app approval queue (`/settings/approvals`, `/m/settings/approvals`).
 * Secondary to the email: same states, same words. Approve here needs a
 * sign-in from the last 12 hours; an older session is sent through sign-in
 * and back to the same card.
 */
export function ApprovalsQueue() {
  const [filter, setFilter] = useState<Filter>('pending');
  const query = useApprovalsQueue(filter);

  if (query.isError && isNotFound(query.error)) return <ApprovalsNotFound />;

  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const pendingCount = query.data?.pages[0]?.pending_count;

  return (
    <Stack>
      <FilterTabs
        aria-label="Filter approvals"
        items={[
          { id: 'pending', label: TABS[0].label, count: pendingCount },
          { id: 'all', label: TABS[1].label },
        ]}
        activeId={filter}
        onSelect={(id) => {
          setFilter(id === 'all' ? 'all' : 'pending');
        }}
      />
      {query.isPending ? <Meta role="status">Loading approvals…</Meta> : null}
      {query.isError ? (
        <Alert role="alert">We could not load your approvals. Reload the page to try again.</Alert>
      ) : null}
      {query.isSuccess && items.length === 0 ? (
        <EmptyState>
          {filter === 'pending' ? 'Nothing is waiting for you.' : 'No approvals yet.'}
        </EmptyState>
      ) : null}
      {items.length > 0 ? (
        <List aria-label="Approvals">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </List>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="secondary"
          loading={query.isFetchingNextPage}
          onClick={() => {
            query.fetchNextPage().catch(() => undefined);
          }}
        >
          Load more
        </Button>
      ) : null}
    </Stack>
  );
}
