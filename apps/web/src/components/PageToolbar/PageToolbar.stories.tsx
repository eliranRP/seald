import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PageToolbar } from './PageToolbar';

const meta: Meta<typeof PageToolbar> = {
  title: 'L2/PageToolbar',
  component: PageToolbar,
  tags: ['autodocs', 'layer-2'],
  args: {
    currentPage: 2,
    totalPages: 4,
  },
};
export default meta;
type Story = StoryObj<typeof PageToolbar>;

export const Default: Story = {
  args: {
    currentPage: 2,
    totalPages: 4,
    onJumpToNextZone: () => {},
    onPrevPage: () => {},
    onNextPage: () => {},
  },
};

export const NoJump: Story = {
  args: {
    currentPage: 2,
    totalPages: 4,
    onPrevPage: () => {},
    onNextPage: () => {},
  },
};

export const FirstPage: Story = {
  args: {
    currentPage: 1,
    totalPages: 4,
    onJumpToNextZone: () => {},
    onPrevPage: () => {},
    onNextPage: () => {},
  },
};

export const LastPage: Story = {
  args: {
    currentPage: 4,
    totalPages: 4,
    onJumpToNextZone: () => {},
    onPrevPage: () => {},
    onNextPage: () => {},
  },
};

function PlaygroundDemo() {
  const [page, setPage] = useState(1);
  const total = 6;
  return (
    <div style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
      <PageToolbar
        currentPage={page}
        totalPages={total}
        onPrevPage={() => setPage((p) => Math.max(1, p - 1))}
        onNextPage={() => setPage((p) => Math.min(total, p + 1))}
        onJumpToNextZone={() => setPage((p) => Math.min(total, p + 1))}
      />
      <span>Current page: {page}</span>
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundDemo />,
};
