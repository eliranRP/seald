import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Briefcase, Mail, Star } from 'lucide-react';
import { SideBar } from './SideBar';
import type { SideBarNavItem } from './SideBar.types';

const meta: Meta<typeof SideBar> = {
  title: 'L3/SideBar',
  component: SideBar,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof SideBar>;

function InteractiveDemo({ initialItem = 'inbox' }: { readonly initialItem?: string }) {
  const [active, setActive] = useState<string>(initialItem);
  return (
    <SideBar
      activeItemId={active}
      onSelectItem={(id) => setActive(id)}
      primaryAction={{ label: 'New document', onClick: () => {} }}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveDemo />,
};

export const SentActive: Story = {
  render: () => <InteractiveDemo initialItem="sent" />,
};

export const NoPrimaryAction: Story = {
  render: () => <SideBar primaryAction={undefined} />,
};

const CUSTOM_ITEMS: ReadonlyArray<SideBarNavItem> = [
  { id: 'starred', label: 'Starred', icon: Star, count: 4 },
  { id: 'mail', label: 'Mail', icon: Mail, count: 9 },
  { id: 'work', label: 'Work', icon: Briefcase },
];

export const CustomItems: Story = {
  render: () => (
    <SideBar
      items={CUSTOM_ITEMS}
      activeItemId="mail"
      primaryAction={{ label: 'Compose', onClick: () => {} }}
    />
  ),
};
