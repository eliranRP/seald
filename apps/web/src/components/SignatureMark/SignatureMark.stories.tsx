import type { Meta, StoryObj } from '@storybook/react';
import { SignatureMark } from './SignatureMark';

const meta: Meta<typeof SignatureMark> = {
  title: 'L1/SignatureMark',
  component: SignatureMark,
  tags: ['autodocs', 'layer-1'],
  args: { name: 'Jamie Okonkwo', size: 44 },
};
export default meta;
type Story = StoryObj<typeof SignatureMark>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <SignatureMark name="Jamie" size={28} />
      <SignatureMark name="Jamie Okonkwo" size={44} />
      <SignatureMark name="Jamie Okonkwo" size={56} tone="indigo" />
      <SignatureMark name="Jamie" underline={false} />
    </div>
  ),
};

export const WithInteraction: Story = {
  render: () => <SignatureMark name="Put your name to it." />,
};

export const Edge: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16 }}>
      <SignatureMark name="X" />
      <SignatureMark name="ישראלה כהן" />
    </div>
  ),
};
