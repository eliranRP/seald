import { useState } from 'react';
import type { AutomationRunOutput } from 'shared';
import { Button } from '@/components/Button';
import { RunList } from '@/components/RunList';
import { useAutomationRuns, useRetryRun } from './automationsApi';
import { Notice } from './automations.styles';
import { errorCode, fixTarget, toRunItem, type FixTarget } from './model';

export interface RunHistoryProps {
  readonly automationId: string;
  /** Fix does not call the API: the page moves the owner to the thing to fix. */
  readonly onFix: (target: FixTarget) => void;
}

const EMPTY = 'Nothing has run yet. Send a document that matches this recipe.';

function retryProblem(err: unknown): string {
  return errorCode(err) === 'retry_not_allowed' || errorCode(err) === 'automation_disabled'
    ? "This run can't be retried. Fix the automation, then send the document again."
    : "Couldn't retry. Try again.";
}

/** Newest first, 20 a page. Retry for a temporary failure, Fix for a permanent one. */
export function RunHistory({ automationId, onFix }: RunHistoryProps) {
  const runs = useAutomationRuns(automationId);
  const retry = useRetryRun();
  const [retryError, setRetryError] = useState<string | null>(null);

  if (runs.isLoading) return <p role="status">Loading runs</p>;
  if (runs.isError) {
    return (
      <Notice $tone="error" role="alert">
        Couldn&apos;t load the run history.
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void runs.refetch();
          }}
        >
          Try again
        </Button>
      </Notice>
    );
  }

  const all: AutomationRunOutput[] = (runs.data?.pages ?? []).flatMap((page) => page.items);
  return (
    <>
      <RunList
        runs={all.map(toRunItem)}
        emptyText={EMPTY}
        hasMore={runs.hasNextPage}
        onLoadMore={() => {
          void runs.fetchNextPage();
        }}
        onRetry={(runId) => {
          setRetryError(null);
          retry.mutate(
            { id: automationId, runId },
            {
              onError: (err) => {
                setRetryError(retryProblem(err));
              },
            },
          );
        }}
        onFix={(runId) => {
          const run = all.find((r) => r.id === runId);
          if (run) onFix(fixTarget(run));
        }}
      />
      {retryError ? (
        <Notice $tone="error" role="alert">
          {retryError}
        </Notice>
      ) : null}
    </>
  );
}
