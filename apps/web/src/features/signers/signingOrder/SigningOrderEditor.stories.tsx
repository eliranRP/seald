import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { reconcileRows, type SigningOrderValue } from './model';
import { SigningOrderEditor, type SigningOrderSigner } from './SigningOrderEditor';

const SIGNERS: ReadonlyArray<SigningOrderSigner> = [
  { id: 'a', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'b', name: 'Bo Chen', email: 'bo@example.com' },
  { id: 'c', name: 'Cy Ito', email: 'cy@example.com' },
];

function Controlled({ initial }: { readonly initial: SigningOrderValue }) {
  const [raw, setRaw] = useState(initial);
  return (
    <SigningOrderEditor
      signers={SIGNERS}
      value={reconcileRows(
        raw,
        SIGNERS.map((s) => s.id),
      )}
      onChange={setRaw}
    />
  );
}

const meta: Meta<typeof Controlled> = {
  title: 'L2/SigningOrderEditor',
  component: Controlled,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => {
      // Stories render with the flag on so the control is visible.
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { signingOrder: true };
      return <Story />;
    },
  ],
};
export default meta;
type Story = StoryObj<typeof Controlled>;

export const AnyOrder: Story = { args: { initial: { sequential: false, rows: [] } } };

export const InOrder: Story = {
  args: {
    initial: {
      sequential: true,
      rows: [
        { id: 'a', joinsPrevious: false },
        { id: 'b', joinsPrevious: false },
        { id: 'c', joinsPrevious: false },
      ],
    },
  },
};

export const GroupedStep: Story = {
  args: {
    initial: {
      sequential: true,
      rows: [
        { id: 'a', joinsPrevious: false },
        { id: 'b', joinsPrevious: true },
        { id: 'c', joinsPrevious: false },
      ],
    },
  },
};

export const Mobile: Story = {
  ...InOrder,
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};
