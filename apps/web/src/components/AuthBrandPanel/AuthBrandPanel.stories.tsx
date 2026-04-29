import type { Meta, StoryObj } from '@storybook/react-vite';
import { AuthBrandPanel } from './AuthBrandPanel';

const meta: Meta<typeof AuthBrandPanel> = {
  title: 'L2/AuthBrandPanel',
  component: AuthBrandPanel,
  tags: ['autodocs', 'layer-2'],
  parameters: {
    layout: 'centered',
  },
};
export default meta;
type Story = StoryObj<typeof AuthBrandPanel>;

/**
 * The panel is designed to sit inside a flexbox row on the auth pages, so the
 * story wraps it in a fixed 620x800 container to preview it in isolation.
 */
export const Default: Story = {
  render: () => (
    <div style={{ width: 620, height: 800, display: 'flex' }}>
      <AuthBrandPanel />
    </div>
  ),
};
