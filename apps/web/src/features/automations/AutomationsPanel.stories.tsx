import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AutomationsPanel } from './AutomationsPanel';
import { fakeAutomation, fakeDriveAutomation } from './fixtures';
import { StoryProviders } from './storyProviders';

const meta: Meta<typeof AutomationsPanel> = {
  title: 'L4/Settings/AutomationsPanel',
  component: AutomationsPanel,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: { basePath: '/settings/automations' },
};
export default meta;
type Story = StoryObj<typeof AutomationsPanel>;

export const EmptyGallery: Story = {
  render: (args) => (
    <StoryProviders seed={{ list: [] }}>
      <AutomationsPanel {...args} />
    </StoryProviders>
  ),
};

export const WithAutomations: Story = {
  render: (args) => (
    <StoryProviders
      seed={{
        list: [
          fakeAutomation({
            last_run: {
              status: 'done',
              status_word: 'Done',
              created_at: '2026-10-02T10:00:00.000Z',
            },
          }),
          fakeDriveAutomation({ enabled: false, status_word: 'Off' }),
        ],
      }}
    >
      <AutomationsPanel {...args} />
    </StoryProviders>
  ),
};
