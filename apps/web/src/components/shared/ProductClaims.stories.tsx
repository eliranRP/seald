import type { Meta, StoryObj } from '@storybook/react-vite';
import { RetentionNotice } from './RetentionNotice';
import { SenderProgressNote } from './SenderProgressNote';
import { SignatureLevelNote } from './SignatureLevelNote';

const meta: Meta = {
  title: 'Shared/Product claims',
  parameters: { layout: 'padded' },
};
export default meta;

type Story = StoryObj;

export const SignatureLevel: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <SignatureLevelNote />
    </div>
  ),
};

export const Retention: Story = {
  render: () => (
    <div style={{ maxWidth: 560 }}>
      <RetentionNotice verifyPath="/verify/A6F2-91D3" />
    </div>
  ),
};

export const SenderProgress: Story = {
  render: () => (
    <p style={{ maxWidth: 560 }}>
      <SenderProgressNote />
    </p>
  ),
};
