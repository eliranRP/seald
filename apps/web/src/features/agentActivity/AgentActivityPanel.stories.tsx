import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AgentActivityItem } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AgentActivityPanel } from './AgentActivityPanel';
import { AGENT_ACTIVITY_KEY } from './agentActivityApi';
import { fakeActivity, fakePage, sampleActivity } from './fixtures';

// The panel reads its first page from the React Query cache, so seeding it
// keeps every story off the network.
function Seeded({
  items,
  nextCursor = null,
  children,
}: {
  readonly items: ReadonlyArray<AgentActivityItem>;
  readonly nextCursor?: string | null;
  readonly children: ReactNode;
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(AGENT_ACTIVITY_KEY, {
    pages: [fakePage(items, nextCursor)],
    pageParams: [undefined],
  });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <div style={{ padding: 16, maxWidth: 720 }}>{children}</div>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof AgentActivityPanel> = {
  title: 'L4/Settings/AgentActivityPanel',
  component: AgentActivityPanel,
  tags: ['autodocs', 'layer-4'],
  parameters: {
    layout: 'fullscreen',
    chromatic: { modes: chromaticViewportModes },
  },
};
export default meta;
type Story = StoryObj<typeof AgentActivityPanel>;

export const Mixed: Story = {
  render: () => (
    <Seeded items={sampleActivity()}>
      <AgentActivityPanel />
    </Seeded>
  ),
};

export const WithLoadMore: Story = {
  render: () => (
    <Seeded items={sampleActivity()} nextCursor="more">
      <AgentActivityPanel />
    </Seeded>
  ),
};

export const Empty: Story = {
  render: () => (
    <Seeded items={[]}>
      <AgentActivityPanel />
    </Seeded>
  ),
};

/** A long document title wraps inside the row on a phone. */
export const LongTitle: Story = {
  render: () => (
    <Seeded
      items={[
        fakeActivity({
          title:
            'Master services agreement between the parties for the provision of managed document workflow services, amended',
        }),
      ]}
    >
      <AgentActivityPanel />
    </Seeded>
  ),
};
