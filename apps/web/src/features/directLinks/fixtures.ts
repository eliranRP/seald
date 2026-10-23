import type { DirectLink } from 'shared';
import type { DirectLinkPanelProps } from './DirectLinkPanel';

export const FAKE_TOKEN = `dl_${'x'.repeat(43)}`;

export const fakeTemplate: DirectLinkPanelProps['template'] = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Consulting agreement',
  hasExamplePdf: true,
  lastSigners: [
    { id: 'slot-owner', name: 'Olive Owner', email: 'olive@example.com' },
    { id: 'slot-guest', name: 'Client', email: 'client@example.com' },
  ],
};

export function fakeLink(over: Partial<DirectLink> = {}): DirectLink {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    template_id: fakeTemplate.id,
    signer_slot: 'slot-guest',
    enabled: true,
    prefix: 'dl_xxxxxx',
    daily_cap: 50,
    sender_name: 'Olive',
    created_last_24h: 3,
    created_at: '2026-10-22T10:00:00.000Z',
    updated_at: '2026-10-22T10:00:00.000Z',
    ...over,
  };
}
