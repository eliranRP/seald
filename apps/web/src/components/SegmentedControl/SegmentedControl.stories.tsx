import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { PenLine, Type, Upload } from 'lucide-react';
import { SegmentedControl } from './SegmentedControl';

const meta: Meta<typeof SegmentedControl> = {
  title: 'L1/SegmentedControl',
  component: SegmentedControl,
  tags: ['autodocs', 'layer-1'],
};
export default meta;
type Story = StoryObj<typeof SegmentedControl>;

function Demo({ block, stacked }: { readonly block?: boolean; readonly stacked?: boolean }) {
  const [value, setValue] = useState('draw');
  return (
    <SegmentedControl
      aria-label="Signature style"
      block={block}
      stacked={stacked}
      value={value}
      onChange={setValue}
      options={[
        { value: 'draw', label: 'Draw', icon: PenLine },
        { value: 'type', label: 'Type', icon: Type },
        { value: 'upload', label: 'Upload', icon: Upload },
      ]}
    />
  );
}

export const Default: Story = { render: () => <Demo /> };
export const Block: Story = { render: () => <Demo block /> };
export const Stacked: Story = { render: () => <Demo block stacked /> };
