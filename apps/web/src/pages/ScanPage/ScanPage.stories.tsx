import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { ScanPage } from './ScanPage';

const meta: Meta<typeof ScanPage> = {
  title: 'L4/ScanPage',
  component: ScanPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof ScanPage>;

/** `/scan` on a computer: the QR dialog (needs the API to get a code). */
export const Default: Story = {};

/** `/scan/:code` on a phone: checks the code, then opens the camera. */
export const AllVariants: Story = {
  args: { code: 'storybookcodestorybookcode000000' },
};

export const Edge: Story = {
  args: { code: 'short' },
};
