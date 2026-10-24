import type { Meta, StoryObj } from '@storybook/react-vite';
import { AddSignerPanel } from './AddSignerPanel';

const CONTACTS = [
  { id: 'c1', name: 'Maya Raskin', email: 'maya@farrow.co', color: '#F472B6' },
  { id: 'c2', name: 'Hannah Wills', email: 'hannah@farrow.co', color: '#7DD3FC' },
  { id: 'c3', name: 'Jonah Park', email: 'jonah@park.dev', color: '#FBBF24' },
  { id: 'c4', name: 'Priya Kapoor', email: 'priya@kapoor.in', color: '#A78BFA' },
  { id: 'c5', name: 'Tom Lee', email: 'tom@lee.io', color: '#34D399' },
];

const meta: Meta<typeof AddSignerPanel> = {
  title: 'L3/AddSignerPanel',
  component: AddSignerPanel,
  tags: ['autodocs', 'layer-3'],
  args: {
    contacts: CONTACTS,
    existingIds: ['c1'],
    existingEmails: ['maya@farrow.co'],
    onAddContacts: () => {},
    onCreate: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 320 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof AddSignerPanel>;

export const Default: Story = {};
export const NoContacts: Story = { args: { contacts: [], existingIds: [] } };
