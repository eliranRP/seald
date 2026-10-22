import type { Meta, StoryObj } from '@storybook/react-vite';
import { FieldTile } from './FieldTile';

const meta: Meta<typeof FieldTile> = {
  title: 'L1/FieldTile',
  component: FieldTile,
  tags: ['autodocs', 'layer-1'],
  parameters: { layout: 'centered' },
};
export default meta;
type Story = StoryObj<typeof FieldTile>;

const ANA = { name: 'Ana Torres', color: '#F472B6' } as const;
const BEN = { name: 'Ben Chen', color: '#34D399' } as const;

export const Signature: Story = {
  args: { kind: 'signature', signer: ANA, required: true },
};

export const Optional: Story = {
  args: { kind: 'text', signer: BEN, required: false },
};

export const Unassigned: Story = {
  args: { kind: 'date', signer: undefined, required: true },
};

export const LongSignerName: Story = {
  args: {
    kind: 'email',
    signer: { name: 'Elizabeth Catherine Featherstonehaugh-Smythe', color: '#A78BFA' },
    required: true,
  },
};

export const AllKinds: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8, width: 320 }}>
      <FieldTile kind="signature" signer={ANA} />
      <FieldTile kind="initials" signer={ANA} />
      <FieldTile kind="date" signer={BEN} />
      <FieldTile kind="text" signer={BEN} required={false} />
      <FieldTile kind="checkbox" signer={ANA} />
      <FieldTile kind="email" signer={undefined} />
    </div>
  ),
};
