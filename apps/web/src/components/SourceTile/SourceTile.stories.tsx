import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileUp, LayoutTemplate } from 'lucide-react';
import { SourceTile } from './SourceTile';

const meta: Meta<typeof SourceTile> = {
  title: 'L1/SourceTile',
  component: SourceTile,
  tags: ['autodocs', 'layer-1'],
  args: { icon: FileUp, label: 'Upload file', meta: 'PDF, Word', selected: true },
  decorators: [
    (Story) => (
      <div role="radiogroup" aria-label="Source" style={{ maxWidth: 280 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SourceTile>;

export const Selected: Story = {};
export const Idle: Story = { args: { icon: LayoutTemplate, label: 'Template', selected: false } };
export const Stacked: Story = { args: { stacked: true, meta: undefined } };
