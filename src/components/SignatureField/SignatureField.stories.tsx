import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { SignatureField } from './SignatureField';
import { FIELD_KINDS } from '../../types/sealdTypes';

const meta: Meta<typeof SignatureField> = {
  title: 'L2/SignatureField',
  component: SignatureField,
  tags: ['autodocs', 'layer-2'],
  args: { kind: 'signature', signerName: 'Jamie Okonkwo' },
};
export default meta;
type Story = StoryObj<typeof SignatureField>;

export const Default: Story = {};

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {FIELD_KINDS.map((k) => (
        <SignatureField key={k} kind={k} signerName="Jamie" />
      ))}
      <SignatureField kind="signature" signerName="Jamie" filled />
      <SignatureField kind="signature" signerName="Jamie" selected />
    </div>
  ),
};

function InteractionDemo() {
  const [sel, setSel] = useState(false);
  return (
    <SignatureField
      kind="signature"
      signerName="Jamie"
      selected={sel}
      onClick={() => setSel((s) => !s)}
    />
  );
}

export const WithInteraction: Story = {
  render: () => <InteractionDemo />,
};

export const Edge: Story = {
  render: () => <SignatureField kind="signature" signerName="ישראלה כהן" width={120} height={36} />,
};
