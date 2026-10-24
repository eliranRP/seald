import type { Meta, StoryObj } from '@storybook/react-vite';
import { ScanWithPhoneDialog } from './ScanWithPhoneDialog';

const meta: Meta<typeof ScanWithPhoneDialog> = {
  title: 'L3/ScanWithPhoneDialog',
  component: ScanWithPhoneDialog,
  tags: ['autodocs', 'layer-3'],
  args: { open: true, onClose: () => undefined, onContinue: () => undefined },
};
export default meta;
type Story = StoryObj<typeof ScanWithPhoneDialog>;

/** Needs the API: without one the dialog lands on its "Try again" state. */
export const Default: Story = {};

export const AllVariants: Story = {
  render: (args) => <ScanWithPhoneDialog {...args} />,
};

export const Edge: Story = {
  args: { open: false },
};
