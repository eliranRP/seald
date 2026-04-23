import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { PageThumbStrip } from './PageThumbStrip';

const meta: Meta<typeof PageThumbStrip> = {
  title: 'L2/PageThumbStrip',
  component: PageThumbStrip,
  tags: ['autodocs', 'layer-2'],
  args: {
    totalPages: 4,
    currentPage: 1,
    onSelectPage: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof PageThumbStrip>;

export const Default: Story = {
  args: { totalPages: 4, currentPage: 1 },
};

export const WithFieldDots: Story = {
  args: { totalPages: 4, currentPage: 4, pagesWithFields: [1, 4] },
};

export const Many: Story = {
  args: { totalPages: 20, currentPage: 7, pagesWithFields: [3, 7, 12] },
};

function PlaygroundStrip() {
  const [page, setPage] = useState(1);
  return (
    <div style={{ display: 'grid', gap: 12, placeItems: 'center' }}>
      <div>Current page: {page}</div>
      <PageThumbStrip
        totalPages={6}
        currentPage={page}
        onSelectPage={setPage}
        pagesWithFields={[2, 5]}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundStrip />,
};
