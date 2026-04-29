import type { Meta, StoryObj } from '@storybook/react-vite';
import { DocThumb } from './DocThumb';

const meta: Meta<typeof DocThumb> = {
  title: 'L1/DocThumb',
  component: DocThumb,
  tags: ['autodocs', 'layer-1'],
  args: { title: 'NDA 2026', size: 52 },
};
export default meta;
type Story = StoryObj<typeof DocThumb>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'end' }}>
      <DocThumb title="A" size={40} />
      <DocThumb title="B" size={52} />
      <DocThumb title="C" size={72} signed />
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <DocThumb title="Interactive" signed />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 12 }}>
      <DocThumb title="" />
      <DocThumb title="Very Long Title That Should Only Be Used As aria-label" size={72} />
    </div>
  ),
};
