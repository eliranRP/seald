import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { writeDoneSnapshot } from '../../features/signing';
import { SigningDonePage } from './SigningDonePage';

const ENVELOPE_ID = 'env-storybook-001';

// Seed at module load so the first render of the page already sees the
// snapshot in sessionStorage (the page redirects away if it's missing).
if (typeof window !== 'undefined') {
  writeDoneSnapshot({
    kind: 'submitted',
    envelope_id: ENVELOPE_ID,
    short_code: 'STORYBOOKDONE',
    title: 'Master Services Agreement',
    sender_name: 'Eliran Azulay',
    recipient_email: 'maya@example.com',
    timestamp: '2026-04-24T00:00:00Z',
  });
}

function Wrap({ children }: { readonly children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[`/sign/${ENVELOPE_ID}/done`]}>
      <Routes>
        <Route path="/sign/:envelopeId/done" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const meta: Meta<typeof SigningDonePage> = {
  title: 'L4/SigningDonePage',
  component: SigningDonePage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <Wrap>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof SigningDonePage>;

export const Default: Story = {
  name: 'Sealed terminal screen',
};
