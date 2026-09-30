import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { UserMenu } from './UserMenu';

function onSignOut(): void {
  /* story stub */
}

const meta: Meta<typeof UserMenu> = {
  title: 'L2/UserMenu',
  component: UserMenu,
  tags: ['autodocs', 'layer-2'],
  parameters: { chromatic: { modes: chromaticViewportModes } },
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

export const WithSettings: Story = {
  args: { onOpenSettings: () => {} },
};

export const Mobile: Story = {
  args: { onOpenSettings: () => {} },
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  args: { onOpenSettings: () => {} },
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
