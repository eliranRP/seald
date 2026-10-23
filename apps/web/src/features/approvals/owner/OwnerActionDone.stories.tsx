import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { OwnerActionDone } from './OwnerActionDone';
import { FAKE_KEY_SECRET, fakeOwnerDetail } from './fixtures';

const meta: Meta<typeof OwnerActionDone> = {
  title: 'L4/Approvals/OwnerActionDone',
  component: OwnerActionDone,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <Story />
      </div>
    ),
  ],
  args: { onAccountDeleted: fn() },
};
export default meta;
type Story = StoryObj<typeof OwnerActionDone>;

/** Right after Approve: the new key, once, in the shared show-once sheet. */
export const NewKeyShownOnce: Story = {
  args: {
    detail: fakeOwnerDetail('api_key_create', {
      status: 'done',
      reveal: { api_key_secret: FAKE_KEY_SECRET },
    }),
  },
};

/** Opened again later: the secret is gone. */
export const NewKeyLater: Story = {
  args: { detail: fakeOwnerDetail('api_key_create', { status: 'done' }) },
};

export const ExportReady: Story = {
  args: { detail: fakeOwnerDetail('account_export', { status: 'done' }) },
};
