import type { Meta, StoryObj } from '@storybook/react';
import { PenTool, FileSignature, Send, ShieldCheck } from 'lucide-react';
import { Icon } from './Icon';

const meta: Meta<typeof Icon> = {
  title: 'L1/Icon',
  component: Icon,
  tags: ['autodocs', 'layer-1'],
  args: { icon: PenTool, size: 20 },
};
export default meta;
type Story = StoryObj<typeof Icon>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Icon icon={PenTool} size={16} label="Pen tool" />
      <Icon icon={FileSignature} size={20} label="File signature" />
      <Icon icon={Send} size={24} label="Send" />
      <Icon icon={ShieldCheck} size={32} label="Shield check" />
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => (
    <button type="button" aria-label="Send" style={{ padding: 8 }}>
      <Icon icon={Send} size={20} />
    </button>
  ),
};

export const Edge: Story = {
  render: () => (
    <div>
      <Icon icon={PenTool} />
      <Icon icon={PenTool} label="חתום כאן" /> {/* RTL label */}
    </div>
  ),
};
