import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ConnectedApp } from 'shared';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { ConnectedApps } from './ConnectedApps';
import { CONNECTED_APPS_KEY } from './connectedAppsApi';
import { fakeConnectedApp } from './fixtures';

// Flags are compile-time constants. Stories turn them on through the
// documented test override so the section renders.
interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
function withOAuth(): void {
  (globalThis as OverrideHost).__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true, mcpOauth: true };
}

// The list is read from the React Query cache, so seeding it keeps every
// story off the network.
function Wrap({
  apps,
  children,
}: {
  readonly apps: ReadonlyArray<ConnectedApp>;
  readonly children: ReactNode;
}) {
  withOAuth();
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  qc.setQueryData(CONNECTED_APPS_KEY, apps);
  return (
    <QueryClientProvider client={qc}>
      <div style={{ padding: 16, maxWidth: 720 }}>{children}</div>
    </QueryClientProvider>
  );
}

const meta: Meta<typeof ConnectedApps> = {
  title: 'L4/Settings/ConnectedApps',
  component: ConnectedApps,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof ConnectedApps>;

export const Empty: Story = {
  render: () => (
    <Wrap apps={[]}>
      <ConnectedApps />
    </Wrap>
  ),
};

export const WithApps: Story = {
  render: () => (
    <Wrap
      apps={[
        fakeConnectedApp(),
        fakeConnectedApp({
          id: '00000000-0000-4000-8000-0000000000c2',
          client_name: 'Agent Example',
          client_host: 'agent.example.org',
          unverified: true,
          scopes: ['envelopes:read'],
          last_used_at: null,
        }),
      ]}
    >
      <ConnectedApps />
    </Wrap>
  ),
};
