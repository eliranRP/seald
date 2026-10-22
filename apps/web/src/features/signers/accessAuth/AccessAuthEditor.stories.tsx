import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { AccessAuthEditor } from './AccessAuthEditor';
import type { AccessAuthSigner } from './AccessAuthEditor';
import { DEFAULT_ACCESS_AUTH, reconcileAccessAuth } from './model';
import type { AccessAuthValue } from './model';

const SIGNERS: ReadonlyArray<AccessAuthSigner> = [
  { id: 'a', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'b', name: 'Bo Chen', email: 'bo@example.com' },
];

function Controlled({ initial }: { readonly initial: AccessAuthValue }) {
  const [raw, setRaw] = useState(initial);
  return (
    <AccessAuthEditor
      signers={SIGNERS}
      value={reconcileAccessAuth(
        raw,
        SIGNERS.map((s) => s.id),
      )}
      onChange={setRaw}
    />
  );
}

const meta: Meta<typeof Controlled> = {
  title: 'L2/AccessAuthEditor',
  component: Controlled,
  tags: ['autodocs', 'layer-2'],
  parameters: { layout: 'padded', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story) => {
      // Stories render with the flag on so the control is visible.
      (
        globalThis as unknown as { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> }
      ).__SEALD_FEATURE_OVERRIDES__ = { signerAccessAuth: true };
      return <Story />;
    },
  ],
};
export default meta;
type Story = StoryObj<typeof Controlled>;

export const Off: Story = { args: { initial: DEFAULT_ACCESS_AUTH } };

export const CodeToOpen: Story = {
  args: { initial: { access: true, action: false, overrides: {} } },
};

export const OpenAndBeforeSigning: Story = {
  args: { initial: { access: true, action: true, overrides: {} } },
};

export const WithRecipientOverride: Story = {
  args: {
    initial: { access: true, action: false, overrides: { b: { access: 'off', action: 'on' } } },
  },
};
