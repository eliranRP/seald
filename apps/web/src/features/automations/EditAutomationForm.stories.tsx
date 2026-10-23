import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { EditAutomationForm } from './EditAutomationForm';
import { fakeAutomation, fakeDriveAutomation } from './fixtures';

const meta: Meta<typeof EditAutomationForm> = {
  title: 'L3/Automations/EditAutomationForm',
  component: EditAutomationForm,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    automation: fakeAutomation(),
    busy: false,
    saved: false,
    fixFieldRef: null,
    onSave: () => undefined,
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
type Story = StoryObj<typeof EditAutomationForm>;

export const Webhook: Story = {};

export const Saved: Story = { args: { saved: true } };

export const Refused: Story = {
  args: { problem: "Seald can't send to that address. Use a public https address." },
};

export const Drive: Story = { args: { automation: fakeDriveAutomation() } };
