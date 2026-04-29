import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { NavBar } from './NavBar';
import type { NavItem } from './NavBar.types';
import { seald } from '../../styles/theme';

const meta: Meta<typeof NavBar> = {
  title: 'L3/NavBar',
  component: NavBar,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof NavBar>;

function InteractiveDemo() {
  const [active, setActive] = useState<string>('documents');
  return (
    <NavBar
      activeItemId={active}
      onSelectItem={(id) => setActive(id)}
      user={{ name: 'Jamie Okonkwo' }}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveDemo />,
};

export const WithoutUser: Story = {
  render: () => <NavBar />,
};

const ALT_ITEMS: ReadonlyArray<NavItem> = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

export const CustomItems: Story = {
  render: () => <NavBar items={ALT_ITEMS} activeItemId="b" user={{ name: 'Alex Rivers' }} />,
};

export const GuestMode: Story = {
  render: () => (
    <NavBar
      mode="guest"
      onSignIn={() => {
        /* story stub */
      }}
      onSignUp={() => {
        /* story stub */
      }}
    />
  ),
};

export const LogoSlot: Story = {
  render: () => (
    <NavBar
      logo={
        <span
          style={{
            fontFamily: seald.font.serif,
            fontSize: seald.font.size.h5,
            fontWeight: seald.font.weight.semibold,
          }}
        >
          LawCo
        </span>
      }
      user={{ name: 'Jamie Okonkwo' }}
    />
  ),
};
