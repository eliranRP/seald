import type { Meta, StoryObj } from '@storybook/react';
import { SendPanelFooter } from './SendPanelFooter';

const meta: Meta<typeof SendPanelFooter> = {
  title: 'L2/SendPanelFooter',
  component: SendPanelFooter,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded' },
  args: {
    fieldCount: 2,
    signerCount: 2,
    onSend: () => {},
    onSaveDraft: () => {},
  },
};
export default meta;
type Story = StoryObj<typeof SendPanelFooter>;

export const Empty: Story = {
  args: { fieldCount: 0, signerCount: 1 },
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <SendPanelFooter {...args} />
    </div>
  ),
};

export const Ready: Story = {
  args: { fieldCount: 3, signerCount: 2 },
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <SendPanelFooter {...args} />
    </div>
  ),
};

export const SingleField: Story = {
  args: { fieldCount: 1, signerCount: 1 },
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <SendPanelFooter {...args} />
    </div>
  ),
};

export const NoDraft: Story = {
  args: { fieldCount: 2, signerCount: 2, onSaveDraft: undefined },
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <SendPanelFooter {...args} />
    </div>
  ),
};

export const Playground: Story = {
  render: (args) => (
    <div style={{ maxWidth: 320 }}>
      <SendPanelFooter {...args} />
    </div>
  ),
};
