import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { DebugAuthPage } from './DebugAuthPage';

const meta: Meta<typeof DebugAuthPage> = {
  title: 'L4/DebugAuthPage',
  component: DebugAuthPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <MemoryRouter initialEntries={['/debug/auth']}>
        <Story />
      </MemoryRouter>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof DebugAuthPage>;

export const Default: Story = {
  name: 'Signed-out (default)',
};
