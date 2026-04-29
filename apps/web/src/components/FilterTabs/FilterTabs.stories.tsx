import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FilterTabs } from './FilterTabs';

const meta: Meta<typeof FilterTabs> = {
  title: 'L2/FilterTabs',
  component: FilterTabs,
  tags: ['autodocs', 'layer-2'],
};
export default meta;
type Story = StoryObj<typeof FilterTabs>;

function Demo({ withCounts }: { readonly withCounts: boolean }) {
  const [active, setActive] = useState('all');
  const items = withCounts
    ? [
        { id: 'all', label: 'All', count: 12 },
        { id: 'you', label: 'Awaiting you', count: 4 },
        { id: 'others', label: 'Awaiting others', count: 5 },
        { id: 'completed', label: 'Completed', count: 2 },
        { id: 'drafts', label: 'Drafts', count: 1 },
      ]
    : [
        { id: 'all', label: 'All' },
        { id: 'you', label: 'Awaiting you' },
        { id: 'others', label: 'Awaiting others' },
        { id: 'completed', label: 'Completed' },
        { id: 'drafts', label: 'Drafts' },
      ];
  return (
    <div style={{ width: 640 }}>
      <FilterTabs
        items={items}
        activeId={active}
        onSelect={setActive}
        aria-label="Document filters"
      />
    </div>
  );
}

export const Default: Story = { render: () => <Demo withCounts /> };
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 24 }}>
      <Demo withCounts />
      <Demo withCounts={false} />
    </div>
  ),
};
export const WithInteraction: Story = { render: () => <Demo withCounts /> };
export const Edge: Story = {
  render: () => (
    <div style={{ width: 480 }}>
      <FilterTabs
        items={[{ id: 'only', label: 'The only tab', count: 0 }]}
        activeId="only"
        onSelect={() => undefined}
        aria-label="Solo"
      />
    </div>
  ),
};
