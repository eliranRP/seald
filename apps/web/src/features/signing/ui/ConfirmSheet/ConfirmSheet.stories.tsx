import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ConfirmSheet } from './ConfirmSheet';

const meta: Meta<typeof ConfirmSheet> = {
  title: 'L3/ConfirmSheet',
  component: ConfirmSheet,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  args: {
    open: true,
    onClose: () => undefined,
    onConfirm: () => undefined,
    title: 'Withdraw consent to sign electronically?',
    children: 'The sender will be notified.',
    confirmLabel: 'Withdraw consent',
    cancelLabel: 'Keep signing',
  },
};
export default meta;
type Story = StoryObj<typeof ConfirmSheet>;

export const Default: Story = {};
export const WithError: Story = { args: { error: 'We could not record that. Please try again.' } };
