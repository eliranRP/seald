import type { Meta, StoryObj } from '@storybook/react-vite';
import { MWBottomSheet } from './MWBottomSheet';

const meta: Meta<typeof MWBottomSheet> = {
  title: 'L3/MWBottomSheet',
  component: MWBottomSheet,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
  args: { open: true, onClose: () => undefined, title: 'Add a signer' },
  render: (args) => (
    <MWBottomSheet {...args}>
      <p style={{ margin: 0 }}>Sheet body goes here.</p>
    </MWBottomSheet>
  ),
};
export default meta;
type Story = StoryObj<typeof MWBottomSheet>;

export const Default: Story = {};

export const NoTitle: Story = {
  render: ({ open, onClose }) => (
    <MWBottomSheet open={open} onClose={onClose} labelledBy="story-sheet-heading">
      <h2 id="story-sheet-heading" style={{ margin: 0 }}>
        Custom heading
      </h2>
    </MWBottomSheet>
  ),
};
