import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DevelopersKeysScreen } from './DevelopersKeysScreen';
import type { ApiKeyListItem, DevelopersKeysScreenProps } from './types';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

const liveKey: ApiKeyListItem = {
  id: 'k1',
  name: 'Key 1',
  prefix: 'seald_live_abcd1234',
  scopes: ['envelopes:read'],
  last_used_at: '2026-09-28T00:00:00.000Z',
  expires_at: '2026-12-29T00:00:00.000Z',
};

const expiredKey: ApiKeyListItem = {
  id: 'k2',
  name: 'Key 2',
  prefix: 'seald_live_abcd5678',
  scopes: ['envelopes:read', 'contacts:read'],
  last_used_at: null,
  expires_at: '2026-01-01T00:00:00.000Z',
};

const tenKeys: readonly ApiKeyListItem[] = Array.from({ length: 10 }, (_, index) => ({
  ...liveKey,
  id: `k${index + 1}`,
  name: `Key ${index + 1}`,
  prefix: `seald_live_abcd${index + 1}234`,
}));

function Screen(
  props: { readonly layout: 'phone' | 'desktop' } & Partial<DevelopersKeysScreenProps>,
) {
  const { layout, ...rest } = props;
  return (
    <MemoryRouter
      initialEntries={[layout === 'phone' ? '/m/settings/developers' : '/settings/developers']}
    >
      <DevelopersKeysScreen
        layout={layout}
        keys={[liveKey, expiredKey]}
        now={NOW}
        onCreate={() => {}}
        onRevoke={() => {}}
        onDismissSecret={() => {}}
        onRetry={() => {}}
        {...rest}
      />
    </MemoryRouter>
  );
}

const meta: Meta<typeof DevelopersKeysScreen> = {
  title: 'L4/Settings/DevelopersKeysScreen',
  component: DevelopersKeysScreen,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen' },
};
export default meta;
type Story = StoryObj<typeof DevelopersKeysScreen>;

function pair(props: Partial<DevelopersKeysScreenProps>): { mobile: Story; desktop: Story } {
  return {
    mobile: {
      render: () => <Screen layout="phone" {...props} />,
      parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
    },
    desktop: {
      render: () => <Screen layout="desktop" {...props} />,
      parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
    },
  };
}

const keys = pair({});
const empty = pair({ keys: [] });
const creating = pair({ keys: [], creating: true });
const advanced = pair({ initialAdvanced: true });
const reveal = pair({ revealedSecret: 'seald_live_shownOnceInTheSheet' });
const revoke = pair({ revokeOpen: true });
const error = pair({ notice: 'Could not save the key.' });
const cap = pair({ keys: tenKeys });
const loadError = pair({ status: 'error', keys: [] });

export const KeysMobile: Story = keys.mobile;
export const KeysDesktop: Story = keys.desktop;
export const EmptyMobile: Story = empty.mobile;
export const EmptyDesktop: Story = empty.desktop;
export const CreatingMobile: Story = creating.mobile;
export const CreatingDesktop: Story = creating.desktop;
export const AdvancedMobile: Story = advanced.mobile;
export const AdvancedDesktop: Story = advanced.desktop;
export const RevealMobile: Story = reveal.mobile;
export const RevealDesktop: Story = reveal.desktop;
export const RevokeMobile: Story = revoke.mobile;
export const RevokeDesktop: Story = revoke.desktop;
export const ErrorMobile: Story = error.mobile;
export const ErrorDesktop: Story = error.desktop;
export const CapMobile: Story = cap.mobile;
export const CapDesktop: Story = cap.desktop;
export const LoadErrorMobile: Story = loadError.mobile;
export const LoadErrorDesktop: Story = loadError.desktop;
