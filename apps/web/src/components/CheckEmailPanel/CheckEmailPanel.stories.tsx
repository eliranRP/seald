import type { Meta, StoryObj } from '@storybook/react-vite';
import { CheckEmailPanel } from './CheckEmailPanel';

const meta: Meta<typeof CheckEmailPanel> = {
  title: 'L3/CheckEmailPanel',
  component: CheckEmailPanel,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'centered' },
  args: {
    email: 'hannah@quill.vc',
    onResend: async () => 'ok',
    onChangeEmail: () => {
      /* storybook stub */
    },
  },
};
export default meta;
type Story = StoryObj<typeof CheckEmailPanel>;

export const OtherDomain: Story = {};
export const Gmail: Story = { args: { email: 'hannah@gmail.com' } };
export const Outlook: Story = { args: { email: 'hannah@outlook.com' } };
export const ResendUnlocked: Story = { args: { cooldownSeconds: 0 } };
export const RateLimited: Story = {
  args: { cooldownSeconds: 0, onResend: async () => 'rate_limited' },
};
