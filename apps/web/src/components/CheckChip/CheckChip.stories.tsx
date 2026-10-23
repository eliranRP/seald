import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckChip } from './CheckChip';

const meta: Meta<typeof CheckChip> = {
  title: 'L1/CheckChip',
  component: CheckChip,
  tags: ['autodocs', 'layer-1'],
  args: { state: 'ok', children: 'Signature valid' },
};
export default meta;
type Story = StoryObj<typeof CheckChip>;

export const Default: Story = {};

export const AllStates: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <CheckChip state="ok" index={0}>
        Signature valid
      </CheckChip>
      <CheckChip state="bad" index={1}>
        Document changed
      </CheckChip>
      <CheckChip state="off" index={2}>
        Timestamp not checked
      </CheckChip>
    </div>
  ),
};
