import { useId } from 'react';
import { Send } from 'lucide-react';
import type { BulkBatch } from 'shared';
import { Button } from '@/components/Button';
import { BatchTable } from './BatchTable';
import { plannedCount } from './model';
import {
  Actions,
  Intro,
  Mono,
  Notice,
  Section,
  SectionTitle,
  SummaryLine,
} from './BulkSend.styles';

export interface PreviewStepProps {
  readonly batch: BulkBatch;
  readonly confirming: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onStartOver: () => void;
}

/**
 * Step 2: every row with its problems, and one button to send the valid
 * ones. Rows with problems are skipped, never fixed silently.
 */
export function PreviewStep({
  batch,
  confirming,
  error,
  onConfirm,
  onStartOver,
}: PreviewStepProps) {
  const ready = plannedCount(batch);
  const problems = batch.counts.invalid;
  const plural = (n: number): string => (n === 1 ? '' : 's');
  const reasonId = useId();
  // A disabled Send must say why (the column notice already explains itself).
  let blockedReason: string | null = null;
  if (!batch.confirmable && batch.column_errors.length === 0) {
    blockedReason =
      ready === 0
        ? 'Nothing to send yet: every row has a problem. Fix them in your file and upload it again.'
        : 'This preview can no longer be sent. Choose the file again to make a new one.';
  }

  return (
    <Section aria-labelledby="bulk-preview-title">
      <SectionTitle id="bulk-preview-title">Check before sending</SectionTitle>
      <SummaryLine role="status">
        {batch.counts.total} row{plural(batch.counts.total)}: {ready} ready to send, {problems} with
        problems.
      </SummaryLine>
      {batch.column_errors.length > 0 ? (
        <Notice $tone="error" role="alert">
          <span>
            The file is missing{' '}
            {batch.column_errors.map((e, i) => (
              <span key={e.column ?? String(i)}>
                {i > 0 ? ', ' : ''}
                <Mono>{e.column}</Mono>
              </span>
            ))}
            . Add the column{plural(batch.column_errors.length)} and upload the file again.
          </span>
        </Notice>
      ) : null}
      {batch.ignored_columns.length > 0 ? (
        <Intro>
          Ignored columns:{' '}
          {batch.ignored_columns.map((c, i) => (
            <span key={c}>
              {i > 0 ? ', ' : ''}
              <Mono>{c}</Mono>
            </span>
          ))}
          .
        </Intro>
      ) : null}
      <BatchTable
        rows={batch.rows}
        mode="preview"
        caption={`Rows from ${batch.filename ?? 'your file'}`}
      />
      {problems > 0 && ready > 0 ? (
        <Intro>
          Rows with problems are skipped. Fix them in your file and upload it again to include them.
        </Intro>
      ) : null}
      {error ? (
        <Notice $tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      {blockedReason ? <Intro id={reasonId}>{blockedReason}</Intro> : null}
      <Actions>
        <Button
          variant="primary"
          iconLeft={Send}
          loading={confirming}
          disabled={!batch.confirmable}
          aria-describedby={blockedReason ? reasonId : undefined}
          onClick={onConfirm}
        >
          {`Send ${String(ready)} envelope${plural(ready)}`}
        </Button>
        <Button variant="secondary" onClick={onStartOver} disabled={confirming}>
          Choose a different file
        </Button>
      </Actions>
    </Section>
  );
}
