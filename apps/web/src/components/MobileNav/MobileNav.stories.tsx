import type { Meta, StoryObj } from '@storybook/react-vite';
import { FileText, LayoutTemplate, User, Users } from 'lucide-react';
import { MobileNav } from './MobileNav';

const meta: Meta<typeof MobileNav> = {
  title: 'L2/MobileNav',
  component: MobileNav,
  tags: ['autodocs', 'layer-2'],
  parameters: { viewport: { defaultViewport: 'mobile1' } },
  args: {
    activeId: 'documents',
    onNavigate: () => undefined,
    onNew: () => undefined,
    items: [
      { id: 'documents', label: 'Documents', icon: FileText, href: '/documents' },
      { id: 'templates', label: 'Templates', icon: LayoutTemplate, href: '/templates' },
      { id: 'signers', label: 'Contacts', icon: Users, href: '/signers' },
      { id: 'settings', label: 'Me', icon: User, href: '/settings' },
    ],
  },
};
export default meta;
type Story = StoryObj<typeof MobileNav>;

export const Default: Story = {
  render: (args) => (
    <div style={{ width: 390 }}>
      <MobileNav {...args} />
    </div>
  ),
};

export const ContactsActive: Story = {
  args: { activeId: 'signers' },
  render: (args) => (
    <div style={{ width: 390 }}>
      <MobileNav {...args} />
    </div>
  ),
};
