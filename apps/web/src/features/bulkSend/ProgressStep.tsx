import { Link } from 'react-router-dom';
import type { BulkBatch } from 'shared';
import { Button } from '@/components/Button';
import { ProgressBar } from '@/components/ProgressBar';
import { BatchTable } from './BatchTable';
import { finishedCount, isFinished, plannedCount } from './model';
import {
  Actions,
  Intro,
  Notice,
  ProgressBlock,
  Section,
  SectionTitle,
  SummaryLine,
} from './BulkSend.styles';

export interface ProgressStepProps {
  readonly batch: BulkBatch;
  readonly canceling: boolean;
  readonly error: string | null;
  readonly onCancel: () => void;
  readonly backTo: string;
}

function headline(batch: BulkBatch): string {
  const c = batch.counts;
  if (batch.status === 'canceled') {
    return `Canceled. ${String(c.sent)} sent, ${String(c.canceled)} stopped.`;
  }
  if (batch.status === 'completed') {
    return c.failed > 0
      ? `Finished. ${String(c.sent)} sent, ${String(c.failed)} failed.`
      : `Finished. All ${String(c.sent)} envelopes were sent.`;
  }
  return `Sending ${String(finishedCount(batch))} of ${String(plannedCount(batch))}.`;
}

/**
 * Step 3: live counts while the worker sends, then the per-row result.
 * The status line is a polite live region; the sender is emailed a summary
 * when the batch ends, so leaving the page is fine.
 */
export function ProgressStep({ batch, canceling, error, onCancel, backTo }: ProgressStepProps) {
  const finished = isFinished(batch);
  const planned = plannedCount(batch);
  return (
    <Section aria-labelledby="bulk-progress-title">
      <SectionTitle id="bulk-progress-title">
        {finished ? 'Bulk send result' : 'Sending your envelopes'}
      </SectionTitle>
      <ProgressBlock>
        <SummaryLine role="status" aria-live="polite">
          {headline(batch)}
        </SummaryLine>
        <ProgressBar
          value={finishedCount(batch)}
          max={Math.max(planned, 1)}
          tone={batch.status === 'completed' && batch.counts.failed === 0 ? 'success' : 'indigo'}
          label={`${String(finishedCount(batch))} of ${String(planned)} rows done`}
        />
      </ProgressBlock>
      {!finished ? (
        <Intro>
          You can leave this page. We email you a summary when the batch is done, and sending
          continues in the background.
        </Intro>
      ) : (
        <Intro>We emailed you a summary. Sent envelopes are on your documents page.</Intro>
      )}
      {error ? (
        <Notice $tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      <BatchTable
        rows={batch.rows.filter((r) => r.status !== 'invalid')}
        mode="progress"
        caption={`Results from ${batch.filename ?? 'your file'}`}
      />
      {batch.counts.invalid > 0 ? (
        <Intro>
          {batch.counts.invalid} row{batch.counts.invalid === 1 ? ' was' : 's were'} skipped because
          of problems found in the preview.
        </Intro>
      ) : null}
      <Actions>
        {!finished ? (
          <Button variant="secondary" loading={canceling} onClick={onCancel}>
            Cancel the rest
          </Button>
        ) : null}
        <Link to={backTo}>Back to templates</Link>
      </Actions>
    </Section>
  );
}
