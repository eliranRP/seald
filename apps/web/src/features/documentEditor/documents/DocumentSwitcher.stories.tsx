import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { useState } from 'react';
import { DocumentSwitcher } from './DocumentSwitcher';

const meta: Meta<typeof DocumentSwitcher> = {
  title: 'L3/DocumentSwitcher',
  component: DocumentSwitcher,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof DocumentSwitcher>;

const DOCS = [
  { id: 'd1', title: 'Master services agreement', meta: '4 fields' },
  { id: 'd2', title: 'Side letter', meta: '0 fields' },
  { id: 'd3', title: 'Schedule A — pricing', meta: '1 field' },
];

function Interactive() {
  const [active, setActive] = useState('d1');
  return <DocumentSwitcher documents={DOCS} activeId={active} onSelect={setActive} />;
}

export const Default: Story = { render: () => <Interactive /> };

export const ManyDocuments: Story = {
  name: 'Ten documents (scrolls sideways)',
  render: () => (
    <DocumentSwitcher
      documents={Array.from({ length: 10 }, (_, i) => ({
        id: `d${String(i)}`,
        title: `Exhibit ${String(i + 1)}`,
        meta: `${String(i)} fields`,
      }))}
      activeId="d3"
      onSelect={() => {}}
    />
  ),
};
