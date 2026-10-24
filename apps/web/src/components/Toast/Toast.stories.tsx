import type { Meta, StoryObj } from '@storybook/react-vite';
import { Clock, Link } from 'lucide-react';
import { Toast } from './Toast';

const meta: Meta<typeof Toast> = {
  title: 'L3/Toast',
  component: Toast,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof Toast>;

const noop = (): void => undefined;

// `placement="fixed"` floats bottom-centre; the wrapper gives it room.

export const Success: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast title="Template saved" subtitle="Reuse it any time from the templates list." />
    </div>
  ),
};

export const WithUndo: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast title="Sent to 3 signers" action={{ label: 'Undo', onClick: noop }} onClose={noop} />
    </div>
  ),
};

export const Error: Story = {
  render: () => (
    <div style={{ minHeight: 240 }}>
      <Toast tone="error" title="Upload failed" action={{ label: 'Retry', onClick: noop }} />
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

export const Patterns: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12, padding: 24, justifyItems: 'start' }}>
      <Toast placement="inline" title="Reminder sent to Hannah" />
      <Toast placement="inline" icon={Link} title="Link copied" />
      <Toast placement="inline" icon={Clock} tone="info" title="Too many requests · try in 30 s" />
    </div>
  ),
};
