import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner } from './Banner';

const meta: Meta<typeof Banner> = {
  title: 'L1/Banner',
  component: Banner,
  tags: ['autodocs', 'layer-1'],
  args: { tone: 'info', children: 'Check your inbox for the sign-in link.' },
};
export default meta;
type Story = StoryObj<typeof Banner>;

export const Default: Story = {};

export const AllTones: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, maxWidth: 420 }}>
      <Banner tone="info">Check your inbox for the sign-in link.</Banner>
      <Banner tone="ok">Saved.</Banner>
      <Banner tone="error">That link expired. Ask for a new one.</Banner>
    </div>
  ),
};
