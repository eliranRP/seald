import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/renderWithProviders';

const requestMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    request: (...args: unknown[]): unknown => requestMock(...args),
  },
}));

import { BulkSendPanel } from './BulkSendPanel';
import {
  BATCH_ID,
  TEMPLATE_ID,
  fakeBatch,
  fakeFinishedWithFailure,
  fakePreviewWithProblems,
  fakeProcessing,
  fakeSchema,
} from './fixtures';

interface Call {
  readonly method: string;
  readonly url: string;
  readonly data?: unknown;
}

/** Answer each request from a table keyed `METHOD url`; anything else is a 404. */
function serve(table: Record<string, unknown | ((call: Call) => unknown)>): void {
  requestMock.mockImplementation((call: Call) => {
    const key = `${call.method.toUpperCase()} ${call.url}`;
    const entry = table[key];
    if (entry === undefined) return Promise.resolve({ status: 404, data: { error: 'not_found' } });
    const value = typeof entry === 'function' ? (entry as (c: Call) => unknown)(call) : entry;
    if (value && typeof value === 'object' && '__status' in value) {
      const { __status, ...data } = value as { __status: number };
      return Promise.resolve({ status: __status, data });
    }
    return Promise.resolve({ status: 200, data: value });
  });
}

const SCHEMA_KEY = `GET /templates/${TEMPLATE_ID}/bulk-schema`;
const BATCH_KEY = `GET /bulk-batches/${BATCH_ID}`;
const UPLOAD_KEY = `POST /templates/${TEMPLATE_ID}/bulk-batches`;
const CONFIRM_KEY = `POST /bulk-batches/${BATCH_ID}/confirm`;
const CANCEL_KEY = `POST /bulk-batches/${BATCH_ID}/cancel`;

function renderPanel(props: { batchId?: string } = {}) {
  const onBatchCreated = vi.fn();
  const onStartOver = vi.fn();
  const view = renderWithProviders(
    <MemoryRouter>
      <BulkSendPanel
        templateId={TEMPLATE_ID}
        batchId={props.batchId}
        onBatchCreated={onBatchCreated}
        onStartOver={onStartOver}
        backTo="/templates"
      />
    </MemoryRouter>,
  );
  return { ...view, onBatchCreated, onStartOver };
}

function csv(name = 'tenants.csv'): File {
  return new File(['recipient_1_name,recipient_1_email\n'], name, { type: 'text/csv' });
}

describe('BulkSendPanel', () => {
  beforeEach(() => {
    requestMock.mockReset();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('upload step', () => {
    it('lists the columns the template needs and offers a sample file', async () => {
      serve({ [SCHEMA_KEY]: fakeSchema() });
      renderPanel();

      expect(await screen.findByRole('heading', { name: 'Upload your recipients' })).toBeVisible();
      const columns = screen.getByRole('list', { name: 'Columns the file needs' });
      expect(within(columns).getByText('recipient_1_email')).toBeInTheDocument();
      expect(within(columns).getByText('recipient_2_name')).toBeInTheDocument();
      expect(within(columns).getByText('Landlord:')).toBeInTheDocument();
      const sample = screen.getByRole('link', { name: 'Download a sample CSV' });
      expect(sample).toHaveAttribute('download', 'bulk-send-template.csv');
      expect(decodeURIComponent(sample.getAttribute('href') ?? '')).toContain(
        'recipient_2_email,title',
      );
    });

    it('asks for a file before it calls the server', async () => {
      const user = userEvent.setup();
      serve({ [SCHEMA_KEY]: fakeSchema() });
      renderPanel();

      await user.click(await screen.findByRole('button', { name: 'Preview' }));

      expect(await screen.findByRole('alert')).toHaveTextContent('Choose a CSV file first.');
      expect(requestMock.mock.calls.some((c) => (c[0] as Call).method === 'post')).toBe(false);
    });

    it('uploads the file with the chosen expiry and hands the new batch to the host', async () => {
      const user = userEvent.setup();
      serve({ [SCHEMA_KEY]: fakeSchema(), [UPLOAD_KEY]: fakeBatch() });
      const { onBatchCreated } = renderPanel();

      await user.upload(await screen.findByLabelText('CSV file'), csv());
      await user.selectOptions(screen.getByLabelText('Each request expires in'), '14 days');
      await user.click(screen.getByRole('button', { name: 'Preview' }));

      await waitFor(() => {
        expect(onBatchCreated).toHaveBeenCalledWith(BATCH_ID);
      });
      const upload = requestMock.mock.calls
        .map((c) => c[0] as Call)
        .find((c) => c.method === 'post');
      expect(upload?.url).toBe(`/templates/${TEMPLATE_ID}/bulk-batches`);
      const form = upload?.data as FormData;
      expect((form.get('file') as File).name).toBe('tenants.csv');
      expect(form.get('expires_in_days')).toBe('14');
    });

    it('explains a rejected upload in plain words', async () => {
      const user = userEvent.setup();
      serve({
        [SCHEMA_KEY]: fakeSchema(),
        [UPLOAD_KEY]: { __status: 422, error: 'bulk_too_many_rows' },
      });
      const { onBatchCreated } = renderPanel();

      await user.upload(await screen.findByLabelText('CSV file'), csv());
      await user.click(screen.getByRole('button', { name: 'Preview' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'The file has too many rows. Split it into smaller files of 100 rows or fewer.',
      );
      expect(onBatchCreated).not.toHaveBeenCalled();
    });

    it('says why a template cannot be bulk sent', async () => {
      serve({ [SCHEMA_KEY]: { __status: 422, error: 'template_has_no_example_pdf' } });
      renderPanel();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This template has no saved document. Add one, then try again.',
      );
    });
  });

  describe('preview step', () => {
    it('shows every row with its problems, and sends only the valid ones', async () => {
      const user = userEvent.setup();
      serve({
        [BATCH_KEY]: fakePreviewWithProblems(),
        [CONFIRM_KEY]: fakeProcessing(),
      });
      renderPanel({ batchId: BATCH_ID });

      const table = await screen.findByRole('table', { name: 'Rows from tenants.csv' });
      expect(screen.getByRole('status')).toHaveTextContent(
        '3 rows: 1 ready to send, 2 with problems.',
      );
      const rows = within(table).getAllByRole('row');
      // header + 3 rows
      expect(rows).toHaveLength(4);
      const bad = rows[2];
      expect(within(bad as HTMLElement).getByText('Has problems')).toBeInTheDocument();
      const problems = within(bad as HTMLElement).getByRole('list', { name: 'Problems in row 2' });
      expect(problems).toHaveTextContent('"not-an-email" is not a valid email address.');
      expect(
        within(rows[3] as HTMLElement).getByRole('list', { name: 'Problems in row 3' }),
      ).toHaveTextContent('already used by recipient 1 in this row');
      expect(within(rows[1] as HTMLElement).getByText('Ready')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Send 1 envelope' }));

      expect(await screen.findByText('Sending 1 of 3.')).toBeInTheDocument();
      expect(
        requestMock.mock.calls.some(
          (c) => (c[0] as Call).method === 'post' && (c[0] as Call).url.endsWith('/confirm'),
        ),
      ).toBe(true);
    });

    it('blocks sending when the file is missing a column and names the column', async () => {
      const batch = fakeBatch({
        rows: [
          {
            ...fakePreviewWithProblems().rows[1]!,
            row: 1,
            errors: [
              {
                code: 'missing_column',
                column: 'recipient_2_email',
                message: 'The file has no "recipient_2_email" column (Tenant).',
              },
            ],
          },
        ],
        column_errors: [
          {
            code: 'missing_column',
            column: 'recipient_2_email',
            message: 'The file has no "recipient_2_email" column (Tenant).',
          },
        ],
        ignored_columns: ['notes'],
      });
      serve({ [BATCH_KEY]: batch });
      renderPanel({ batchId: BATCH_ID });

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('The file is missing recipient_2_email');
      expect(screen.getByRole('button', { name: 'Send 0 envelopes' })).toBeDisabled();
      expect(screen.getByText('notes')).toBeInTheDocument();
    });

    it('shows a confirm failure and lets the sender start over', async () => {
      const user = userEvent.setup();
      serve({
        [BATCH_KEY]: fakePreviewWithProblems(),
        [CONFIRM_KEY]: { __status: 409, error: 'bulk_preview_expired' },
      });
      const { onStartOver } = renderPanel({ batchId: BATCH_ID });

      await user.click(await screen.findByRole('button', { name: 'Send 1 envelope' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'This preview expired. Upload the file again.',
      );
      await user.click(screen.getByRole('button', { name: 'Choose a different file' }));
      expect(onStartOver).toHaveBeenCalled();
    });

    it('has no accessibility violations', async () => {
      serve({ [BATCH_KEY]: fakePreviewWithProblems() });
      const { container } = renderPanel({ batchId: BATCH_ID });
      await screen.findByRole('table', { name: 'Rows from tenants.csv' });
      expect(await axe(container)).toHaveNoViolations();
    });
  });

  describe('progress step', () => {
    it('shows live counts, polls while sending, and ends on the result', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      let reads = 0;
      serve({
        [BATCH_KEY]: () => {
          reads += 1;
          return reads === 1 ? fakeProcessing() : fakeFinishedWithFailure();
        },
      });
      renderPanel({ batchId: BATCH_ID });

      expect(await screen.findByText('Sending 1 of 3.')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: '1 of 3 rows done' })).toHaveAttribute(
        'aria-valuenow',
        '1',
      );
      expect(screen.getByRole('button', { name: 'Cancel the rest' })).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(3100);

      expect(await screen.findByText('Finished. 2 sent, 1 failed.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Cancel the rest' })).not.toBeInTheDocument();
      const table = screen.getByRole('table', { name: 'Results from tenants.csv' });
      expect(within(table).getByText('Could not be sent')).toBeInTheDocument();
      expect(
        within(table).getByRole('link', { name: 'Open the envelope for row 1' }),
      ).toHaveAttribute('href', '/document/00000000-0000-4000-8000-000000000e01');
      expect(screen.getByRole('link', { name: 'Back to templates' })).toHaveAttribute(
        'href',
        '/templates',
      );
    });

    it('cancels the rest and shows what was sent and stopped', async () => {
      const user = userEvent.setup();
      serve({
        [BATCH_KEY]: fakeProcessing(),
        [CANCEL_KEY]: fakeBatch({
          status: 'canceled',
          confirmable: false,
          rows: [
            { ...fakeProcessing().rows[0]! },
            { ...fakeProcessing().rows[1]!, status: 'sent', envelope_id: 'e2' },
            { ...fakeProcessing().rows[2]!, status: 'canceled' },
          ],
        }),
      });
      renderPanel({ batchId: BATCH_ID });

      await user.click(await screen.findByRole('button', { name: 'Cancel the rest' }));

      expect(await screen.findByText('Canceled. 2 sent, 1 stopped.')).toBeInTheDocument();
    });

    it('reads a finished batch straight from the link in the summary email', async () => {
      serve({ [BATCH_KEY]: fakeFinishedWithFailure() });
      renderPanel({ batchId: BATCH_ID });
      expect(await screen.findByRole('heading', { name: 'Bulk send result' })).toBeVisible();
      expect(
        screen.getByText('We emailed you a summary. Sent envelopes are on your documents page.'),
      ).toBeVisible();
    });

    it('shows a missing batch as an error with a way back', async () => {
      const user = userEvent.setup();
      serve({ [BATCH_KEY]: { __status: 404, error: 'bulk_batch_not_found' } });
      const { onStartOver } = renderPanel({ batchId: BATCH_ID });
      expect(await screen.findByRole('alert')).toHaveTextContent('We could not find that batch.');
      await user.click(screen.getByRole('button', { name: 'Start a new upload' }));
      expect(onStartOver).toHaveBeenCalled();
    });
  });
});
