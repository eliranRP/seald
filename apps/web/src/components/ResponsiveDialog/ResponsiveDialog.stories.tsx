import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../Button';
import { ResponsiveDialog } from './ResponsiveDialog';

const meta: Meta<typeof ResponsiveDialog> = {
  title: 'L3/ResponsiveDialog',
  component: ResponsiveDialog,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
  args: {
    open: true,
    title: 'Add contacts',
    onClose: () => undefined,
    children: <p>Dialog body.</p>,
    footer: (
      <>
        <Button variant="ghost">Cancel</Button>
        <Button variant="primary">Add</Button>
      </>
    ),
  },
};
export default meta;
type Story = StoryObj<typeof ResponsiveDialog>;

export const Default: Story = {};

export const WithFooterHint: Story = {
  args: { footerStart: <span>3 new · 1 already saved</span> },
};
