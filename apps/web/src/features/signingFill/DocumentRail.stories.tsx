import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { useState } from 'react';
import { DocumentRail } from './DocumentRail';

const meta: Meta<typeof DocumentRail> = {
  title: 'L3/DocumentRail',
  component: DocumentRail,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof DocumentRail>;

const ITEMS = [
  { id: 'd1', title: 'Master services agreement', remaining: 2, total: 3 },
  { id: 'd2', title: 'Side letter', remaining: 0, total: 1 },
  { id: 'd3', title: 'Cover note', remaining: 0, total: 0 },
];

function Interactive() {
  const [active, setActive] = useState('d1');
  return <DocumentRail documents={ITEMS} activeId={active} onSelect={setActive} />;
}

export const Default: Story = { render: () => <Interactive /> };

export const AllDone: Story = {
  args: {
    documents: ITEMS.map((i) => ({ ...i, remaining: 0 })),
    activeId: 'd2',
    onSelect: () => {},
  },
};
