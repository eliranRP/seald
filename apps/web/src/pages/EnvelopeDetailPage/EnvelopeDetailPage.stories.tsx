import type { Meta, StoryObj } from '@storybook/react-vite';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Envelope, EnvelopeEvent } from 'shared';
import { envelopeKeys } from '@/features/envelopes';
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const DETAIL_ENVELOPE: Envelope = {
  id: 'env-1',
  owner_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  title: 'Master Services Agreement',
  short_code: 'DOC-ABCD-1234',
  status: 'awaiting_others',
  delivery_mode: 'parallel',
  original_pages: 4,
  original_sha256: null,
  sealed_sha256: null,
  sender_email: 'jamie@seald.app',
  sender_name: 'Jamie Okonkwo',
  sent_at: '2026-09-29T12:00:00.000Z',
  completed_at: null,
  expires_at: '2026-10-29T12:00:00.000Z',
  tc_version: '2026-04-24',
  privacy_version: '2026-04-24',
  tags: ['msa'],
  reminders_enabled: true,
  created_at: '2026-09-29T11:00:00.000Z',
  updated_at: '2026-09-29T12:00:00.000Z',
  signers: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      email: 'maya@example.com',
      name: 'Maya Raskin',
      color: '#4F46E5',
      role: 'signatory',
      signing_order: 1,
      status: 'awaiting',
      viewed_at: null,
      tc_accepted_at: null,
      signed_at: null,
      declined_at: null,
    },
  ],
  fields: [],
};

const DETAIL_EVENTS: ReadonlyArray<EnvelopeEvent> = [
  {
    id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    envelope_id: 'env-1',
    signer_id: null,
    actor_kind: 'sender',
    event_type: 'sent',
    ip: null,
    user_agent: null,
    metadata: {},
    created_at: '2026-09-29T12:00:00.000Z',
  },
];

function Wrap({ children, seeded }: { readonly children: ReactNode; readonly seeded?: boolean }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  if (seeded) {
    qc.setQueryData(envelopeKeys.detail('env-1'), DETAIL_ENVELOPE);
    qc.setQueryData(envelopeKeys.events('env-1'), { events: DETAIL_EVENTS });
  }
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/document/env-1']}>
        <Routes>
          <Route path="/document/:id" element={children} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof EnvelopeDetailPage> = {
  title: 'L4/EnvelopeDetailPage',
  component: EnvelopeDetailPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
  decorators: [
    (Story, ctx) => (
      <Wrap seeded={ctx.parameters.seeded === true}>
        <Story />
      </Wrap>
    ),
  ],
};
export default meta;
type Story = StoryObj<typeof EnvelopeDetailPage>;

export const Default: Story = {
  name: 'Initial render (skeleton while envelope + events fetch)',
};

/** In-flight envelope: hash-chained timeline and the audit-PDF note. */
export const InFlight: Story = {
  name: 'Awaiting signers',
  parameters: { seeded: true },
};
