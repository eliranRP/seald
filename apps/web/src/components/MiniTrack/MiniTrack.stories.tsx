import type { Meta, StoryObj } from '@storybook/react-vite';
import { MiniTrack } from './MiniTrack';

const meta: Meta<typeof MiniTrack> = {
  title: 'L1/MiniTrack',
  component: MiniTrack,
  tags: ['autodocs', 'layer-1'],
  args: {
    'aria-label': 'Progress for Maya Chen',
    steps: [
      { label: 'Sent', state: 'done' },
      { label: 'Opened', state: 'now' },
      { label: 'Signed', state: 'todo' },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof MiniTrack>;

export const Default: Story = {};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 12 }}>
      <MiniTrack
        aria-label="Signed"
        steps={[
          { label: 'Sent', state: 'done' },
          { label: 'Opened', state: 'done' },
          { label: 'Signed', state: 'done' },
        ]}
      />
      <MiniTrack
        aria-label="Declined"
        steps={[
          { label: 'Sent', state: 'done' },
          { label: 'Opened', state: 'done' },
          { label: 'Signed', state: 'bad' },
        ]}
      />
      <MiniTrack
        aria-label="Bounced"
        steps={[
          { label: 'Sent', state: 'bad' },
          { label: 'Opened', state: 'off' },
          { label: 'Signed', state: 'off' },
        ]}
      />
    </div>
  ),
};
