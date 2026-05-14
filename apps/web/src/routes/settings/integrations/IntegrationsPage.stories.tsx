import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntegrationsPage } from './IntegrationsPage';
import { DisconnectModal } from './DisconnectModal';
import { GDRIVE_ACCOUNTS_KEY, type GDriveAccount } from './useGDriveAccounts';

// Stories seed the React-Query cache directly with the desired account
// list. The page never reaches the network because every queryKey hit
// returns from cache (`staleTime: Infinity`). This keeps the stories
// independent of MSW (not installed today) and matches how the existing
// L4 page stories (ContactsPage etc.) keep visuals deterministic.
function buildClient(accounts: ReadonlyArray<GDriveAccount>): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(GDRIVE_ACCOUNTS_KEY, accounts);
  return qc;
}

interface WrapProps {
  readonly accounts: ReadonlyArray<GDriveAccount>;
  readonly children: ReactNode;
}

function Wrap({ accounts, children }: WrapProps) {
  return (
    <QueryClientProvider client={buildClient(accounts)}>
      <MemoryRouter initialEntries={['/settings/integrations']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof IntegrationsPage> = {
  title: 'L4/Settings/IntegrationsPage',
  component: IntegrationsPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof IntegrationsPage>;

const SEED_ONE: GDriveAccount = {
  id: 'acc-1',
  email: 'eliran@example.com',
  connectedAt: '2026-05-03T10:00:00Z',
  lastUsedAt: '2026-05-03T11:00:00Z',
};

const SEED_MULTI: ReadonlyArray<GDriveAccount> = [
  SEED_ONE,
  {
    id: 'acc-2',
    email: 'work@example.com',
    connectedAt: '2026-04-01T09:00:00Z',
    lastUsedAt: '2026-05-02T08:00:00Z',
  },
];

export const Empty: Story = {
  name: 'Empty (no accounts)',
  render: () => (
    <Wrap accounts={[]}>
      <IntegrationsPage />
    </Wrap>
  ),
};

export const Connected: Story = {
  name: 'Connected (single account)',
  render: () => (
    <Wrap accounts={[SEED_ONE]}>
      <IntegrationsPage />
    </Wrap>
  ),
};

export const ConnectedMultiAccount: Story = {
  name: 'Connected (multi-account, behind feature.gdriveMultiAccount)',
  render: () => (
    <Wrap accounts={SEED_MULTI}>
      <IntegrationsPage />
    </Wrap>
  ),
};

// Audit slice C #4 (HIGH): visual surface for the expired-token row —
// primary Reconnect button + amber "Reconnect required" badge + card
// header pill flips from emerald to amber.
const SEED_RECONNECT: GDriveAccount = {
  ...SEED_ONE,
  tokenStatus: 'reconnect_required',
};
export const ConnectedReconnectRequired: Story = {
  name: 'Connected — token expired (Reconnect required)',
  render: () => (
    <Wrap accounts={[SEED_RECONNECT]}>
      <IntegrationsPage />
    </Wrap>
  ),
};

// Standalone story for the modal so the destructive state can be diffed
// in Chromatic without driving the full page through a click.
export const DisconnectModalOpen: StoryObj<typeof DisconnectModal> = {
  name: 'Disconnect modal — open',
  render: () => (
    <DisconnectModal
      open
      accountEmail="eliran@example.com"
      onClose={() => undefined}
      onConfirm={() => undefined}
    />
  ),
};
