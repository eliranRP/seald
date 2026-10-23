import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AutomationDetail } from './AutomationDetail';
import {
  fakeAutomation,
  fakeDriveAutomation,
  fakePermanentRun,
  fakeRetryableRun,
  fakeRun,
} from './fixtures';
import { StoryProviders } from './storyProviders';

const meta: Meta<typeof AutomationDetail> = {
  title: 'L4/Settings/AutomationDetail',
  component: AutomationDetail,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    id: '00000000-0000-4000-8000-0000000000a1',
    listPath: '/settings/automations',
    integrationsPath: '/settings/integrations',
  },
};
export default meta;
type Story = StoryObj<typeof AutomationDetail>;

export const NoRunsYet: Story = {
  render: (args) => (
    <StoryProviders seed={{ detail: fakeAutomation(), runs: [] }}>
      <AutomationDetail {...args} />
    </StoryProviders>
  ),
};

/** A temporary failure shows Retry; a permanent one shows Fix. */
export const RunHistory: Story = {
  render: (args) => (
    <StoryProviders
      seed={{
        detail: fakeAutomation(),
        runs: [fakeRetryableRun(), fakePermanentRun(), fakeRun()],
      }}
    >
      <AutomationDetail {...args} />
    </StoryProviders>
  ),
};

export const WaitingForApproval: Story = {
  render: (args) => (
    <StoryProviders
      seed={{ detail: fakeAutomation({ enabled: false, awaiting_approval: true }), runs: [] }}
    >
      <AutomationDetail {...args} />
    </StoryProviders>
  ),
};

export const Drive: Story = {
  args: { id: '00000000-0000-4000-8000-0000000000a2' },
  render: (args) => (
    <StoryProviders
      seed={{
        detail: fakeDriveAutomation(),
        runs: [
          fakePermanentRun({
            automation_id: '00000000-0000-4000-8000-0000000000a2',
            failure_slug: 'reconnect_required',
            failure_message: 'Drive needs to be reconnected.',
          }),
        ],
      }}
    >
      <AutomationDetail {...args} />
    </StoryProviders>
  ),
};
