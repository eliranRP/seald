import { Button } from '../Button';
import { Actions, Empty, Item, List, Meta, Reason, Status, Title, Top } from './RunList.styles';
import type { RunListItem, RunListProps } from './RunList.types';

function statusWord(run: RunListItem): string | null {
  switch (run.status) {
    case 'retrying':
      return 'Retrying';
    case 'succeeded':
      return 'Done';
    case 'failed':
      return 'Failed';
    default:
      return null;
  }
}

function attemptText(run: RunListItem): string | null {
  if (run.status !== 'retrying' || run.attempt === undefined || run.maxAttempts === undefined) {
    return null;
  }
  return `attempt ${run.attempt} of ${run.maxAttempts}`;
}

/** Run history: one row per run, with Retry or Fix on failures. */
export function RunList({
  runs,
  onRetry,
  onFix,
  hasMore = false,
  onLoadMore,
  emptyText = 'No runs yet.',
}: RunListProps) {
  if (runs.length === 0) return <Empty>{emptyText}</Empty>;
  return (
    <div>
      <List aria-label="Runs">
        {runs.map((run) => {
          const word = statusWord(run);
          const attempt = attemptText(run);
          return (
            <Item key={run.id}>
              <Top>
                <Title>{run.title}</Title>
                {word ? <Status $status={run.status}>{word}</Status> : null}
              </Top>
              <Meta>
                {run.when}
                {attempt ? ` · ${attempt}` : ''}
              </Meta>
              {run.status === 'failed' && run.reason ? <Reason>{run.reason}</Reason> : null}
              {run.status === 'failed' ? (
                <Actions>
                  {run.retryable ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Retry ${run.title}`}
                      onClick={() => {
                        onRetry(run.id);
                      }}
                    >
                      Retry
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Fix ${run.title}`}
                      onClick={() => {
                        onFix(run.id);
                      }}
                    >
                      Fix
                    </Button>
                  )}
                </Actions>
              ) : null}
            </Item>
          );
        })}
      </List>
      {hasMore && onLoadMore ? (
        <Actions>
          <Button variant="ghost" size="sm" onClick={onLoadMore}>
            Load more
          </Button>
        </Actions>
      ) : null}
    </div>
  );
}
