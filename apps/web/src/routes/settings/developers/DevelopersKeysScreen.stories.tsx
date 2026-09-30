import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { DevelopersKeysScreen } from './DevelopersKeysScreen';
import type { ApiKeyListItem } from './types';

const NOW = Date.parse('2026-09-30T12:00:00.000Z');

const keys: readonly ApiKeyListItem[] = [
  {
    id: 'k1',
    name: 'Key 1',
    prefix: 'seald_live_abcd1234',
    scopes: ['envelopes:read'],
    require_owner_approval: true,
    allow_new_recipients: false,
    always_require_signin: false,
    approval_notify: 'email',
    last_used_at: '2026-09-28T00:00:00.000Z',
    expires_at: '2026-12-29T00:00:00.000Z',
  },
  {
    id: 'k2',
    name: 'Key 2',
    prefix: 'seald_live_abcd5678',
    scopes: ['envelopes:read', 'envelopes:send'],
    require_owner_approval: true,
    allow_new_recipients: false,
    always_require_signin: true,
    approval_notify: 'email',
    last_used_at: null,
    expires_at: '2026-01-01T00:00:00.000Z',
  },
];

function Screen(props: { readonly layout: 'phone' | 'desktop'; readonly revealed?: string }) {
  return (
    <MemoryRouter
      initialEntries={[
        props.layout === 'phone' ? '/m/settings/developers' : '/settings/developers',
      ]}
    >
      <DevelopersKeysScreen
        layout={props.layout}
        keys={keys}
        now={NOW}
        revealedSecret={props.revealed ?? null}
        onCreate={() => {}}
        onRevoke={() => {}}
        onPatch={() => {}}
        onDismissSecret={() => {}}
        onNeedFreshLogin={() => {}}
      />
    </MemoryRouter>
  );
}

const meta: Meta<typeof DevelopersKeysScreen> = {
  title: 'L4/Settings/DevelopersKeysScreen',
  component: DevelopersKeysScreen,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof DevelopersKeysScreen>;

export const Mobile: Story = {
  render: () => <Screen layout="phone" />,
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const Desktop: Story = {
  render: () => <Screen layout="desktop" />,
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};

export const SecretMobile: Story = {
  render: () => <Screen layout="phone" revealed="seald_live_shownOnceInTheSheet" />,
  parameters: { chromatic: { modes: { mobile: chromaticViewportModes.mobile } } },
};

export const SecretDesktop: Story = {
  render: () => <Screen layout="desktop" revealed="seald_live_shownOnceInTheSheet" />,
  parameters: { chromatic: { modes: { desktop: chromaticViewportModes.desktop } } },
};
