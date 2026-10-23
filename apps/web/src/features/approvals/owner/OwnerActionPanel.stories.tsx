import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ApprovalCard } from '../ApprovalCard';
import { OwnerActionPanel, type OwnerActionPanelProps } from './OwnerActionPanel';
import { fakeOwnerDetail } from './fixtures';

/** The card and the WP-45 Approve area together, as `/approve/:id` shows them. */
function Page(props: OwnerActionPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ApprovalCard summary={props.detail.summary} expiresAt={props.detail.expires_at} />
      <OwnerActionPanel {...props} />
    </div>
  );
}

const meta: Meta<typeof Page> = {
  title: 'L4/Approvals/OwnerActionPanel',
  component: Page,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  args: { busy: null, onApprove: fn(), onDeny: fn() },
};
export default meta;
type Story = StoryObj<typeof Page>;

const EXPIRES = { expires_at: '2026-10-24T09:00:00.000Z' };

/** The irreversible-deletion warning and the typed account email. */
export const AccountDelete: Story = {
  args: { detail: fakeOwnerDetail('account_delete', EXPIRES) },
};

/** The signer's consent, the field list on the card, and the adopted signature. */
export const SignAsSigner: Story = {
  args: { detail: fakeOwnerDetail('envelope_sign_as_signer', EXPIRES) },
};

/** A key the agent asked for: name, scopes and expiry; shown once after Approve. */
export const ApiKeyCreate: Story = {
  args: { detail: fakeOwnerDetail('api_key_create', EXPIRES) },
};

export const ApiKeyRevoke: Story = {
  args: { detail: fakeOwnerDetail('api_key_revoke', EXPIRES) },
};

/** Turning "ask before each send" off, with the Terms §4.1 reminder. */
export const ApprovalOff: Story = {
  args: { detail: fakeOwnerDetail('approval_required_toggle', EXPIRES) },
};

export const AccountExport: Story = {
  args: { detail: fakeOwnerDetail('account_export', EXPIRES) },
};

export const RotateWebhookSecret: Story = {
  args: { detail: fakeOwnerDetail('automation_rotate_secret', EXPIRES) },
};

/** Disconnect an OAuth app (WP-27's connected apps). */
export const DisconnectApp: Story = {
  args: { detail: fakeOwnerDetail('oauth_grant_revoke', EXPIRES) },
};

export const Approving: Story = {
  args: { detail: fakeOwnerDetail('api_key_create', EXPIRES), busy: 'approve' },
};
