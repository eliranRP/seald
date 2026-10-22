import { useState } from 'react';
import { Button } from '@/components/Button';
import {
  BulkApiError,
  useBulkBatch,
  useBulkSchema,
  useCancelBulk,
  useConfirmBulk,
  useUploadBulkCsv,
} from './bulkSendApi';
import { errorCopy } from './model';
import { PreviewStep } from './PreviewStep';
import { ProgressStep } from './ProgressStep';
import { UploadStep } from './UploadStep';
import { Notice, Stack } from './BulkSend.styles';

export interface BulkSendPanelProps {
  readonly templateId: string;
  /** The batch in the URL, when there is one. Without it the panel starts at the upload. */
  readonly batchId?: string | undefined;
  /** A preview was created: the host puts its id in the URL. */
  readonly onBatchCreated: (batchId: string) => void;
  /** Back to the upload step (drops the batch id from the URL). */
  readonly onStartOver: () => void;
  /** Where "Back to templates" goes. */
  readonly backTo: string;
}

function messageOf(err: unknown): string {
  return err instanceof BulkApiError ? errorCopy(err.slug) : errorCopy('');
}

/**
 * Bulk send from a template: upload, preview, confirm, progress. The URL
 * carries the batch id, so a refresh or a link from the summary email lands
 * on the right step: a preview shows the check table, a running or finished
 * batch shows progress.
 */
export function BulkSendPanel({
  templateId,
  batchId,
  onBatchCreated,
  onStartOver,
  backTo,
}: BulkSendPanelProps) {
  const schema = useBulkSchema(templateId);
  const batch = useBulkBatch(batchId);
  const upload = useUploadBulkCsv();
  const confirm = useConfirmBulk();
  const cancel = useCancelBulk();
  const [confirmError, setConfirmError] = useState<string | null>(null);

  if (batchId !== undefined) {
    if (batch.isLoading) return <p role="status">Loading the batch</p>;
    if (batch.isError || !batch.data) {
      return (
        <Stack>
          <Notice $tone="error" role="alert">
            {messageOf(batch.error)}
            <Button variant="secondary" size="sm" onClick={onStartOver}>
              Start a new upload
            </Button>
          </Notice>
        </Stack>
      );
    }
    const data = batch.data;
    if (data.status === 'preview') {
      return (
        <Stack>
          <PreviewStep
            batch={data}
            confirming={confirm.isPending}
            error={confirmError}
            onConfirm={() => {
              setConfirmError(null);
              confirm.mutate(data.id, {
                onError: (err) => {
                  setConfirmError(messageOf(err));
                },
              });
            }}
            onStartOver={onStartOver}
          />
        </Stack>
      );
    }
    return (
      <Stack>
        <ProgressStep
          batch={data}
          canceling={cancel.isPending}
          error={cancel.isError ? messageOf(cancel.error) : null}
          onCancel={() => {
            cancel.mutate(data.id);
          }}
          backTo={backTo}
        />
      </Stack>
    );
  }

  if (schema.isLoading) return <p role="status">Loading the template</p>;
  if (schema.isError || !schema.data) {
    return (
      <Stack>
        <Notice $tone="error" role="alert">
          {messageOf(schema.error)}
        </Notice>
      </Stack>
    );
  }
  return (
    <Stack>
      <UploadStep
        schema={schema.data}
        busy={upload.isPending}
        error={upload.isError ? messageOf(upload.error) : null}
        onSubmit={({ file, expiresInDays }) => {
          upload.mutate(
            { templateId, file, expiresInDays },
            {
              onSuccess: (created) => {
                onBatchCreated(created.id);
              },
            },
          );
        }}
      />
    </Stack>
  );
}
