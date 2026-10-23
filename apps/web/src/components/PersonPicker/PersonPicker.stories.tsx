import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import type { AddSignerContact } from '../AddSignerDropdown/AddSignerDropdown.types';
import { PersonPicker } from './PersonPicker';

const meta: Meta<typeof PersonPicker> = {
  title: 'L2/PersonPicker',
  component: PersonPicker,
  tags: ['autodocs', 'layer-2'],
};
export default meta;
type Story = StoryObj<typeof PersonPicker>;

const OPTIONS: ReadonlyArray<AddSignerContact> = [
  { id: 'me:u1', name: 'Eliran Azulay', email: 'eliran@seald.app', color: '#F472B6' },
  { id: 'c1', name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#7DD3FC' },
  { id: 'c2', name: 'Alex Reyes', email: 'alex@quill.vc', color: '#FBBF24' },
  { id: 'c3', name: 'Maya Chen', email: 'maya@farow.co', color: '#A78BFA' },
];

function Stateful({ initial }: { readonly initial: AddSignerContact | null }) {
  const [value, setValue] = useState<AddSignerContact | null>(initial);
  return (
    <div style={{ maxWidth: 360, minHeight: 360 }}>
      <PersonPicker
        aria-label="Person for Signer 1"
        value={value}
        options={OPTIONS}
        youId="me:u1"
        onChange={setValue}
        onCreate={async (email) => ({
          id: `new-${email}`,
          name: email.split('@')[0] ?? email,
          email,
          color: '#34D399',
        })}
      />
    </div>
  );
}

export const Chosen: Story = { render: () => <Stateful initial={OPTIONS[1] ?? null} /> };

export const Empty: Story = { render: () => <Stateful initial={null} /> };
