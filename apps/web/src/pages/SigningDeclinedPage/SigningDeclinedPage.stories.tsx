import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { writeDoneSnapshot } from '../../features/signing';
import { SigningDeclinedPage } from './SigningDeclinedPage';

const ENVELOPE_ID = 'env-storybook-002';

if (typeof window !== 'undefined') {
  writeDoneSnapshot({
    kind: 'declined',
    envelope_id: ENVELOPE_ID,
    short_code: 'STORYBOOKDEC1',
    title: 'Master Services Agreement',
    sender_name: 'Eliran Azulay',
    recipient_email: 'maya@example.com',
    timestamp: '2026-04-24T00:00:00Z',
  });
}

function Wrap({ children }: { readonly children: ReactNode }) {
  return (
    <MemoryRouter initialEntries={[`/sign/${ENVELOPE_ID}/declined`]}>
      <Routes>
        <Route path="/sign/:envelopeId/declined" element={children} />
      </Routes>
    </MemoryRouter>
  );
}

const meta: Meta<typeof SigningDeclinedPage> = {
  title: 'L4/SigningDeclinedPage',
  component: SigningDeclinedPage,
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
type Story = StoryObj<typeof SigningDeclinedPage>;

export const Default: Story = {
  name: 'Declined terminal screen',
};
