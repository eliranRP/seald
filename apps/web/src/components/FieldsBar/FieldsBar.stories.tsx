import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { FieldsBar } from './FieldsBar';
import type { FieldsBarSigner } from './FieldsBar.types';

const meta: Meta<typeof FieldsBar> = {
  title: 'L3/FieldsBar',
  component: FieldsBar,
  tags: ['autodocs', 'layer-3'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof FieldsBar>;

const TWO_SIGNERS: ReadonlyArray<FieldsBarSigner> = [
  { id: 'you', name: 'You', email: 'jamie@sealed.co' },
  { id: 'ana', name: 'Ana Torres', email: 'ana@farrow.law' },
];

const ONE_SIGNER: ReadonlyArray<FieldsBarSigner> = [
  { id: 'you', name: 'You', email: 'jamie@sealed.co' },
];

function InteractiveDemo({
  signers = TWO_SIGNERS,
  withAdd = false,
}: {
  readonly signers?: ReadonlyArray<FieldsBarSigner>;
  readonly withAdd?: boolean;
}) {
  const [active, setActive] = useState<string>('you');
  return (
    <div style={{ height: '100vh', display: 'flex' }}>
      <FieldsBar
        signers={signers}
        activeSignerId={active}
        onSelectSigner={setActive}
        onFieldDragStart={() => {}}
        onFieldActivate={() => {}}
        onAddSigner={withAdd ? () => {} : undefined}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <InteractiveDemo />,
};

export const OneSigner: Story = {
  render: () => <InteractiveDemo signers={ONE_SIGNER} />,
};

export const FilteredKinds: Story = {
  render: () => (
    <div style={{ height: '100vh', display: 'flex' }}>
      <FieldsBar
        fieldKinds={['signature', 'initials', 'date']}
        signers={TWO_SIGNERS}
        activeSignerId="you"
      />
    </div>
  ),
};

export const WithAddSigner: Story = {
  render: () => <InteractiveDemo withAdd />,
};
