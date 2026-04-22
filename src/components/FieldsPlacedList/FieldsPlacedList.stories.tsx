import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { FieldsPlacedList } from './FieldsPlacedList';
import type { FieldsPlacedListItem, FieldsPlacedListSigner } from './FieldsPlacedList.types';

const meta: Meta<typeof FieldsPlacedList> = {
  title: 'L2/FieldsPlacedList',
  component: FieldsPlacedList,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof FieldsPlacedList>;

const SIGNERS: ReadonlyArray<FieldsPlacedListSigner> = [
  { id: 'you', name: 'You Smith', color: '#4F46E5' },
  { id: 'ana', name: 'Ana Torres', color: '#10B981' },
  { id: 'ben', name: 'Ben Lee', color: '#F59E0B' },
  { id: 'cara', name: 'Cara Diaz', color: '#EF4444' },
  { id: 'dan', name: 'Dan Kim', color: '#3B82F6' },
];

const MIXED_FIELDS: ReadonlyArray<FieldsPlacedListItem> = [
  { id: 'f1', type: 'signature', page: 1, signerIds: ['you'] },
  { id: 'f2', type: 'initials', page: 2, signerIds: ['ana'] },
  { id: 'f3', type: 'date', page: 4, signerIds: ['you', 'ana'] },
  { id: 'f4', type: 'text', page: 3, signerIds: ['ana'] },
  { id: 'f5', type: 'checkbox', page: 5, signerIds: ['you'] },
  { id: 'f6', type: 'email', page: 5, signerIds: ['you', 'ana'] },
];

const SHELL: React.CSSProperties = {
  width: 320,
  padding: 16,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-1)',
  borderRadius: 12,
};

export const Empty: Story = {
  render: () => (
    <div style={SHELL}>
      <FieldsPlacedList fields={[]} signers={SIGNERS} />
    </div>
  ),
};

export const Populated: Story = {
  render: () => (
    <div style={SHELL}>
      <FieldsPlacedList fields={MIXED_FIELDS} signers={SIGNERS} onSelectField={() => {}} />
    </div>
  ),
};

const MANY: ReadonlyArray<FieldsPlacedListItem> = [
  {
    id: 'all',
    type: 'signature',
    page: 1,
    signerIds: ['you', 'ana', 'ben', 'cara', 'dan'],
  },
];

export const ManySigners: Story = {
  render: () => (
    <div style={SHELL}>
      <FieldsPlacedList fields={MANY} signers={SIGNERS} />
    </div>
  ),
};

export const Selected: Story = {
  render: () => (
    <div style={SHELL}>
      <FieldsPlacedList
        fields={MIXED_FIELDS}
        signers={SIGNERS}
        selectedFieldId="f3"
        onSelectField={() => {}}
      />
    </div>
  ),
};

function PlaygroundDemo(): JSX.Element {
  const [selected, setSelected] = useState<string | undefined>('f1');
  return (
    <div style={SHELL}>
      <FieldsPlacedList
        fields={MIXED_FIELDS}
        signers={SIGNERS}
        selectedFieldId={selected}
        onSelectField={setSelected}
      />
    </div>
  );
}

export const Playground: Story = {
  render: () => <PlaygroundDemo />,
};
