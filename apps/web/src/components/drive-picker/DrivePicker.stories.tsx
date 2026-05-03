import type { Meta, StoryObj } from '@storybook/react-vite';
import type { JSX } from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { DrivePicker } from './DrivePicker';
import type { DriveFile, DriveMimeFilter, DrivePickerProps } from './DrivePicker.types';
import { driveFilesKey } from './useDriveFiles';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const SAMPLE_FILES: ReadonlyArray<DriveFile> = [
  {
    id: 'd-nda',
    name: '2026 NDA template.gdoc',
    mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-05-01T12:00:00Z',
  },
  {
    id: 'd-msa',
    name: 'Acme MSA - signed.pdf',
    mimeType: 'application/pdf',
    modifiedTime: '2026-04-28T09:00:00Z',
    size: '14000',
  },
  {
    id: 'd-vendor',
    name: 'Vendor agreement.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    modifiedTime: '2026-04-01T16:00:00Z',
  },
  {
    id: 'd-statement',
    name: 'Statement of work — Q2.gdoc',
    mimeType: 'application/vnd.google-apps.document',
    modifiedTime: '2026-03-28T08:00:00Z',
  },
];

interface SeededQueryProps {
  readonly children: JSX.Element;
  readonly seed: 'list' | 'empty' | 'expired' | 'error' | 'loading';
  readonly mimeFilter: DriveMimeFilter;
}

/**
 * Builds a QueryClient pre-seeded with the desired state so stories
 * render deterministically without network. Each variant skips the
 * `queryFn` by either pre-setting `data` or pre-setting `error`.
 */
function SeededQuery({ children, seed, mimeFilter }: SeededQueryProps): JSX.Element {
  // Lazy-init the QueryClient so re-renders driven by Storybook controls
  // don't churn the cache (rule 2.1 — lazy state init for expensive setup).
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
        },
      }),
  );
  const key = driveFilesKey(ACCOUNT_ID, mimeFilter);
  if (seed === 'list') {
    qc.setQueryData(key, { files: SAMPLE_FILES });
  } else if (seed === 'empty') {
    qc.setQueryData(key, { files: [] });
  } else if (seed === 'expired') {
    qc.setQueryData(key, undefined);
    qc.getQueryCache()
      .build(qc, { queryKey: key })
      .setState({
        status: 'error',
        error: Object.assign(new Error('reconnect_required'), { status: 401 }),
        fetchStatus: 'idle',
      });
  } else if (seed === 'error') {
    qc.setQueryData(key, undefined);
    qc.getQueryCache()
      .build(qc, { queryKey: key })
      .setState({
        status: 'error',
        error: new Error('network'),
        fetchStatus: 'idle',
      });
  }
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

interface DemoProps {
  readonly seed: 'list' | 'empty' | 'expired' | 'error' | 'loading';
  readonly overrides?: Partial<DrivePickerProps>;
}

function Demo({ seed, overrides }: DemoProps): JSX.Element {
  const [open, setOpen] = useState(true);
  const mimeFilter: DriveMimeFilter = overrides?.mimeFilter ?? 'all';
  return (
    <SeededQuery seed={seed} mimeFilter={mimeFilter}>
      <div style={{ padding: 24 }}>
        <Button onClick={() => setOpen(true)}>Open picker</Button>
        <DrivePicker
          open={open}
          onClose={() => setOpen(false)}
          onPick={() => setOpen(false)}
          accountId={ACCOUNT_ID}
          mimeFilter={mimeFilter}
          onReconnect={() => {
            /* story stub */
          }}
          {...overrides}
        />
      </div>
    </SeededQuery>
  );
}

const meta: Meta<typeof DrivePicker> = {
  title: 'L3/DrivePicker',
  component: DrivePicker,
  tags: ['autodocs', 'layer-3'],
  parameters: {
    layout: 'fullscreen',
  },
};
export default meta;
type Story = StoryObj<typeof DrivePicker>;

export const FileList: Story = {
  render: () => <Demo seed="list" />,
};

export const EmptyFolder: Story = {
  render: () => <Demo seed="empty" />,
};

export const TokenExpired: Story = {
  render: () => <Demo seed="expired" />,
};

export const NetworkError: Story = {
  render: () => <Demo seed="error" />,
};

export const Loading: Story = {
  render: () => <Demo seed="loading" />,
};
