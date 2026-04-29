import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import type { JSX } from 'react';
import { AddSignerDropdown } from './AddSignerDropdown';
import type { AddSignerContact } from './AddSignerDropdown.types';

const CONTACTS: ReadonlyArray<AddSignerContact> = [
  { id: 'c1', name: 'Ana Torres', email: 'ana@farrow.law', color: '#4F46E5' },
  { id: 'c2', name: 'Brooke Lin', email: 'brooke@acme.co', color: '#10B981' },
  { id: 'c3', name: 'Carlos Mendes', email: 'carlos@acme.co', color: '#F59E0B' },
  { id: 'c4', name: 'Dana Vance', email: 'dana@forge.io', color: '#EF4444' },
  { id: 'c5', name: 'Evan Park', email: 'evan@forge.io', color: '#3B82F6' },
];

function Anchor({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div style={{ position: 'relative', width: 360, padding: '40px 0' }}>
      <div
        style={{
          width: '100%',
          height: 36,
          borderRadius: 8,
          border: '1px dashed #CBD5E1',
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          color: '#64748B',
          fontFamily: 'Inter, sans-serif',
          fontSize: 13,
        }}
      >
        Anchor (dropdown renders below)
      </div>
      {children}
    </div>
  );
}

const meta: Meta<typeof AddSignerDropdown> = {
  title: 'L2/AddSignerDropdown',
  component: AddSignerDropdown,
  tags: ['autodocs', 'layer-2'],
};
export default meta;

type Story = StoryObj<typeof AddSignerDropdown>;

export const Default: Story = {
  render: () => (
    <Anchor>
      <AddSignerDropdown contacts={CONTACTS} onPick={() => {}} onCreate={() => {}} />
    </Anchor>
  ),
};

export const WithExistingExcluded: Story = {
  render: () => (
    <Anchor>
      <AddSignerDropdown
        contacts={CONTACTS}
        existingContactIds={['c1', 'c2']}
        onPick={() => {}}
        onCreate={() => {}}
      />
    </Anchor>
  ),
};

function NewEmailDemo(): JSX.Element {
  const [log, setLog] = useState<string>('');
  return (
    <div>
      <Anchor>
        <AddSignerDropdown
          contacts={CONTACTS}
          onPick={(c) => setLog(`picked ${c.email}`)}
          onCreate={(name, email) => setLog(`created ${name} / ${email}`)}
        />
      </Anchor>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, marginTop: 8 }}>
        Type a fresh email (e.g. new.signer@example.com) to reveal the create row.
        <br />
        Last action: {log || 'none'}
      </div>
    </div>
  );
}

export const NewEmailPath: Story = {
  render: () => <NewEmailDemo />,
};

export const Empty: Story = {
  render: () => (
    <Anchor>
      <AddSignerDropdown contacts={[]} onPick={() => {}} onCreate={() => {}} />
    </Anchor>
  ),
};

export const Playground: Story = {
  args: {
    contacts: CONTACTS,
    existingContactIds: [],
    placeholder: 'Search contacts or type an email…',
    maxResults: 8,
    autoFocus: true,
    onPick: () => {},
    onCreate: () => {},
  },
  render: (args) => (
    <Anchor>
      <AddSignerDropdown {...args} />
    </Anchor>
  ),
};
