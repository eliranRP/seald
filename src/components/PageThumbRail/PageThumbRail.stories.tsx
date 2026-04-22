import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { PageThumbRail } from './PageThumbRail';

const meta: Meta<typeof PageThumbRail> = {
  title: 'L2/PageThumbRail',
  component: PageThumbRail,
  tags: ['autodocs', 'layer-2'],
  // The rail uses `position: sticky`, so give it a scrolling parent in
  // Storybook — otherwise "sticky" has nothing to stick to and the control
  // looks statically positioned.
  decorators: [
    (Story) => (
      <div
        style={{
          height: 520,
          overflow: 'auto',
          padding: 16,
          background: 'var(--bg-app, #F8FAFC)',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <Story />
      </div>
    ),
  ],
  args: {
    totalPages: 4,
    currentPage: 1,
    onSelectPage: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PageThumbRail>;

export const Default: Story = {
  args: { totalPages: 4, currentPage: 1 },
};

export const WithFieldCounts: Story = {
  args: {
    totalPages: 4,
    currentPage: 3,
    fieldCountByPage: { 1: 1, 3: 2, 4: 1 },
  },
};

/** 100+ page document — exercises the rail's internal scroll + fixed width. */
export const Many: Story = {
  args: {
    totalPages: 102,
    currentPage: 24,
    fieldCountByPage: { 3: 1, 7: 3, 24: 2, 55: 1, 102: 4 },
  },
};

function PlaygroundRail() {
  const [page, setPage] = useState(3);
  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: 12,
          color: 'var(--fg-2, #374151)',
        }}
      >
        Current page: {page}
      </div>
      <PageThumbRail
        totalPages={12}
        currentPage={page}
        onSelectPage={setPage}
        fieldCountByPage={{ 2: 1, 4: 2, 8: 1 }}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundRail />,
};
