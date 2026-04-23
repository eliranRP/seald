import type { Meta, StoryObj } from '@storybook/react';
import { EmailMasthead } from './EmailMasthead';

const meta: Meta<typeof EmailMasthead> = {
  title: 'L2/EmailMasthead',
  component: EmailMasthead,
  tags: ['autodocs', 'layer-2'],
  args: { brand: 'Seald' },
};
export default meta;
type Story = StoryObj<typeof EmailMasthead>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 16, width: 520 }}>
      <EmailMasthead brand="Seald" />
      <EmailMasthead brand="Acme" />
      <EmailMasthead brand="North Atlas" mark={<span>NA</span>} />
    </div>
  ),
};

export const Edge: Story = {
  render: () => (
    <div style={{ width: 520 }}>
      <EmailMasthead brand="A very long brand name that stretches" />
    </div>
  ),
};
