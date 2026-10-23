import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AutomationList } from './AutomationList';
import { fakeAutomation, fakeDriveAutomation } from './fixtures';

const meta: Meta<typeof AutomationList> = {
  title: 'L3/Automations/AutomationList',
  component: AutomationList,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    basePath: '/settings/automations',
    onToggle: () => undefined,
    items: [
      fakeAutomation({
        last_run: { status: 'done', status_word: 'Done', created_at: '2026-10-02T10:00:00.000Z' },
      }),
      fakeDriveAutomation({
        last_run: {
          status: 'failed',
          status_word: 'Failed',
          created_at: '2026-10-02T10:00:00.000Z',
        },
      }),
    ],
  },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <div style={{ padding: 16 }}>
          <Story />
        </div>
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AutomationList>;

export const Default: Story = {};

export const OffAndWaiting: Story = {
  args: {
    items: [
      fakeAutomation({ enabled: false, status_word: 'Off' }),
      fakeDriveAutomation({ enabled: false, awaiting_approval: true }),
    ],
  },
};

export const Saving: Story = { args: { pendingId: '00000000-0000-4000-8000-0000000000a1' } };
