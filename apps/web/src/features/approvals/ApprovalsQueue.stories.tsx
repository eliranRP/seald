import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApprovalDetail } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { approvalKeys } from './approvalsApi';
import { ApprovalsQueue } from './ApprovalsQueue';
import { fakeDetail, fakeSummary, KNOWN_RECIPIENTS, NEW_RECIPIENT } from './fixtures';

function Seeded({
  items,
  children,
}: {
  readonly items: ReadonlyArray<ApprovalDetail>;
  readonly children: ReactNode;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const page = {
    items,
    next_cursor: null,
    pending_count: items.filter((i) => i.status === 'pending').length,
  };
  qc.setQueryData(approvalKeys.list('pending'), { pages: [page], pageParams: [undefined] });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ padding: 16 }}>{children}</div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof ApprovalsQueue> = {
  title: 'L4/Approvals/ApprovalsQueue',
  component: ApprovalsQueue,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
};
export default meta;
type Story = StoryObj<typeof ApprovalsQueue>;

const ID_2 = '55555555-5555-4555-8555-555555555555';

export const Waiting: Story = {
  render: () => (
    <Seeded
      items={[
        fakeDetail(),
        fakeDetail({
          id: ID_2,
          summary: fakeSummary({
            title: 'NDA for Linus',
            recipients: [...KNOWN_RECIPIENTS, NEW_RECIPIENT],
          }),
        }),
      ]}
    >
      <ApprovalsQueue />
    </Seeded>
  ),
};

export const Empty: Story = {
  render: () => (
    <Seeded items={[]}>
      <ApprovalsQueue />
    </Seeded>
  ),
};
