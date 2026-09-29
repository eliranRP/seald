import type { Meta, StoryObj } from '@storybook/react-vite';
import { RetentionNotice } from './RetentionNotice';
import { SenderProgressNote } from './SenderProgressNote';
import { SignatureLevelNote } from './SignatureLevelNote';
import { VerifyTrustChecks } from './VerifyTrustChecks';

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

/** Payload does not report a CMS seal or a timestamp, so only the chain is shown. */
export const VerifyChecksWithoutSeal: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <VerifyTrustChecks />
    </div>
  ),
};

/** Shown only when a future verify payload says the seal and timestamp are present. */
export const VerifyChecksWithSeal: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <VerifyTrustChecks hasPadesSeal hasRfc3161Timestamp />
    </div>
  ),
};
