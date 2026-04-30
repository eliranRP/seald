import type { Meta, StoryObj } from '@storybook/react-vite';
import { Toast } from './Toast';

const meta: Meta<typeof Toast> = {
  title: 'L3/Toast',
  component: Toast,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof Toast>;

// The Toast is `position: fixed` so the wrapping div just provides
// some breathing room while the toast renders against the viewport.

export const Success: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast title="Template saved" subtitle="Reuse it any time from the templates list." />
    </div>
  ),
};

export const SingleLine: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast title="Sent for signature" />
    </div>
  ),
};

export const Error: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast tone="error" title="Save failed" subtitle="Network error — please retry." />
    </div>
  ),
};

export const Info: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast tone="info" title="Working from a saved template" />
    </div>
  ),
};
