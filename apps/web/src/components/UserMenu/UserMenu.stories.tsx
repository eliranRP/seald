import type { Meta, StoryObj } from '@storybook/react-vite';
import { UserMenu } from './UserMenu';

function onSignOut(): void {
  /* story stub */
}

const meta: Meta<typeof UserMenu> = {
  title: 'L2/UserMenu',
  component: UserMenu,
  tags: ['autodocs', 'layer-2'],
  args: {
    user: { name: 'Jamie Okonkwo', email: 'jamie@seald.app' },
    onSignOut,
  },
};
export default meta;
type Story = StoryObj<typeof UserMenu>;

export const Default: Story = {};

export const WithAvatarUrl: Story = {
  args: {
    user: {
      name: 'Ada Lovelace',
      email: 'ada@seald.app',
      avatarUrl: 'https://i.pravatar.cc/64?img=47',
    },
  },
};
