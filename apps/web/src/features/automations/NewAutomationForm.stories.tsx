import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { NewAutomationForm } from './NewAutomationForm';

const meta: Meta<typeof NewAutomationForm> = {
  title: 'L3/Automations/NewAutomationForm',
  component: NewAutomationForm,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    busy: false,
    onSave: () => undefined,
    onCancel: () => undefined,
    card: {
      id: 'sealed_webhook',
      kind: 'webhook',
      title: 'Send a webhook when sealed',
      line: 'Post a signed message to your own address when a document is sealed.',
    },
  },
  decorators: [
    (Story) => (
      <div style={{ padding: 16, maxWidth: 720 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof NewAutomationForm>;

export const Webhook: Story = {};

export const WebhookRefused: Story = {
  args: { problem: "Seald can't send to that address. Use a public https address." },
};

export const Drive: Story = {
  args: {
    card: {
      id: 'sealed_save_drive',
      kind: 'drive',
      title: 'Save sealed copies to Drive',
      line: 'Every finished document lands in My Drive / Seald.',
    },
  },
};

export const Email: Story = {
  args: {
    card: {
      id: 'declined_notify_me',
      kind: 'email',
      title: 'Email me when someone declines',
      line: 'A short note the moment a signer declines.',
    },
  },
};
