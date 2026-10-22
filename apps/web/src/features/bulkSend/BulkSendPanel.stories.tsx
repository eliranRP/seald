import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BulkBatch } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { BulkSendPanel } from './BulkSendPanel';
import { bulkKeys } from './bulkSendApi';
import { BATCH_ID, TEMPLATE_ID, fakePreviewWithProblems, fakeSchema } from './fixtures';

function noop(): void {
  /* story stub */
}

// The panel reads from the React Query cache, so seeding it keeps every
// story off the network. Only non-polling states are seeded here; the
// polling progress view is covered by ProgressStep's stories.
function Wrap({ batch, children }: { readonly batch?: BulkBatch; readonly children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(bulkKeys.schema(TEMPLATE_ID), fakeSchema());
  if (batch) qc.setQueryData(bulkKeys.batch(batch.id), batch);
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ padding: 16 }}>{children}</div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof BulkSendPanel> = {
  title: 'L4/BulkSend/BulkSendPanel',
  component: BulkSendPanel,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
  args: {
    templateId: TEMPLATE_ID,
    onBatchCreated: noop,
    onStartOver: noop,
    backTo: '/templates',
  },
};
export default meta;
type Story = StoryObj<typeof BulkSendPanel>;

export const Upload: Story = {
  render: (args) => (
    <Wrap>
      <BulkSendPanel {...args} />
    </Wrap>
  ),
};

export const PreviewWithProblems: Story = {
  render: (args) => (
    <Wrap batch={fakePreviewWithProblems()}>
      <BulkSendPanel {...args} batchId={BATCH_ID} />
    </Wrap>
  ),
};
