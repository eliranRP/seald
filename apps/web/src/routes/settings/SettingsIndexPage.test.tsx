import { describe, expect, it, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import { SettingsIndexPage } from './SettingsIndexPage';
import type { FeatureFlag } from 'shared';

function setFlags(flags: Partial<Record<FeatureFlag, boolean>>): void {
  (
    globalThis as { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> }
  ).__SEALD_FEATURE_OVERRIDES__ = flags;
}

afterEach(() => {
  delete (globalThis as { __SEALD_FEATURE_OVERRIDES__?: unknown }).__SEALD_FEATURE_OVERRIDES__;
});

describe('SettingsIndexPage', () => {
  it('is not available when the flag is off', () => {
    setFlags({ mcpServer: false });
    const { getByRole, getByText } = renderWithProviders(
      <MemoryRouter initialEntries={['/m/settings']}>
        <SettingsIndexPage />
      </MemoryRouter>,
    );
    expect(getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(getByText('Not available.')).toBeInTheDocument();
  });

  it('lists Developers and Integrations when those flags are on', () => {
    setFlags({ mcpServer: true, gdriveIntegration: true });
    const { getByRole } = renderWithProviders(
      <MemoryRouter initialEntries={['/settings']}>
        <SettingsIndexPage />
      </MemoryRouter>,
    );
    expect(getByRole('link', { name: 'Developers' })).toHaveAttribute(
      'href',
      '/settings/developers',
    );
    expect(getByRole('link', { name: 'Integrations' })).toHaveAttribute(
      'href',
      '/settings/integrations',
    );
  });
});
