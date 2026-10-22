import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';
import { chromaticViewportModes } from '@/stories/chromaticViewports';
import { SettingsIndexPage } from './SettingsIndexPage';

// Flags are compile-time constants. Stories turn them on through the
// documented test override so the rows render.
interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
function withFlags(flags: Record<string, boolean>): void {
  (globalThis as OverrideHost).__SEALD_FEATURE_OVERRIDES__ = flags;
}

const meta: Meta<typeof SettingsIndexPage> = {
  title: 'L4/Settings/SettingsIndexPage',
  component: SettingsIndexPage,
  tags: ['autodocs', 'layer-4'],
  parameters: { layout: 'fullscreen', chromatic: { modes: chromaticViewportModes } },
};
export default meta;
type Story = StoryObj<typeof SettingsIndexPage>;

export const Desktop: Story = {
  render: () => {
    withFlags({ gdriveIntegration: true, mcpServer: true });
    return (
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsIndexPage variant="desktop" />
      </MemoryRouter>
    );
  },
};

export const Mobile: Story = {
  render: () => {
    withFlags({ gdriveIntegration: true, mcpServer: true });
    return (
      <MemoryRouter initialEntries={['/m/settings']}>
        <SettingsIndexPage variant="mobile" />
      </MemoryRouter>
    );
  },
};

export const DevelopersOnly: Story = {
  render: () => {
    withFlags({ gdriveIntegration: false, publicApi: true });
    return (
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsIndexPage variant="desktop" />
      </MemoryRouter>
    );
  },
};
