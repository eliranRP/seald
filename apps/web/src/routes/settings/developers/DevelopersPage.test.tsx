import { describe, expect, it, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { renderWithTheme } from '@/test/renderWithTheme';
import { DevelopersPage } from './DevelopersPage';
import type { FeatureFlag } from 'shared';

function setFlags(flags: Partial<Record<FeatureFlag, boolean>>): void {
  (
    globalThis as { __SEALD_FEATURE_OVERRIDES__?: Partial<Record<FeatureFlag, boolean>> }
  ).__SEALD_FEATURE_OVERRIDES__ = flags;
}

afterEach(() => {
  delete (globalThis as { __SEALD_FEATURE_OVERRIDES__?: unknown }).__SEALD_FEATURE_OVERRIDES__;
});

describe('DevelopersPage', () => {
  it('is not available when the flag is off', () => {
    setFlags({ mcpServer: false });
    const { getByRole, getByText, queryByRole } = renderWithTheme(
      <MemoryRouter initialEntries={['/settings/developers']}>
        <DevelopersPage />
      </MemoryRouter>,
    );
    expect(getByRole('heading', { name: 'Developers' })).toBeInTheDocument();
    expect(getByText('Not available.')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'New key' })).toBeNull();
  });
});
