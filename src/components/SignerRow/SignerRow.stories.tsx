import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { SignerRow } from './SignerRow';
import { SIGNER_STATUSES } from '../../types/sealdTypes';
import type { Signer } from '../../types/sealdTypes';

const base: Signer = {
  id: 's1',
  name: 'Jamie Okonkwo',
  email: 'jamie@seald.app',
  status: 'awaiting-you',
};

const meta: Meta<typeof SignerRow> = {
  title: 'L3/SignerRow',
  component: SignerRow,
  tags: ['autodocs', 'layer-3'],
  args: { signer: base, showMenu: true },
};
export default meta;
type Story = StoryObj<typeof SignerRow>;

export const Default: Story = {};
export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 8, maxWidth: 480 }}>
      {SIGNER_STATUSES.map((status, i) => (
        <SignerRow
          key={status}
          signer={{ id: `s${i}`, name: `Signer ${i + 1}`, email: `signer${i}@seald.app`, status }}
        />
      ))}
    </div>
  ),
};
function InteractionDemo() {
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <SignerRow signer={base} onMenuClick={(id) => setLastClicked(id)} />
      <div>Last menu click: {lastClicked ?? 'none'}</div>
    </div>
  );
}

export const WithInteraction: Story = {
  render: () => <InteractionDemo />,
};
export const Edge: Story = {
  render: () => (
    <SignerRow
      signer={{
        id: 'long',
        name: 'Very Very Very Long Signer Name Which Should Truncate',
        email: 'absurdly.long.email.address.used.for.testing@example.com',
        status: 'completed',
      }}
    />
  ),
};
