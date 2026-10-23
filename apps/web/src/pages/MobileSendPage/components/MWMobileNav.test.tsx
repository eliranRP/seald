import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as flagsModule from 'shared';
import { MWMobileNav } from './MWMobileNav';

describe('MWMobileNav — Settings item', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
  });

  afterEach(() => {
    isFeatureEnabledSpy.mockRestore();
  });

  function renderNav() {
    return renderWithProviders(
      <MemoryRouter initialEntries={['/m/send']}>
        <MWMobileNav onSignOut={vi.fn()} />
      </MemoryRouter>,
    );
  }

  it('shows exactly one Settings row and no Integrations or Developers rows', async () => {
    const user = userEvent.setup();
    isFeatureEnabledSpy.mockReturnValue(true);
    renderNav();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getAllByRole('button', { name: 'Settings' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /integrations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /developers/i })).not.toBeInTheDocument();
  });

  it('shows Settings when only the developer flags are on', async () => {
    const user = userEvent.setup();
    isFeatureEnabledSpy.mockImplementation((flag: string) => flag === 'mcpServer');
    renderNav();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('hides Settings when every settings flag is off', async () => {
    const user = userEvent.setup();
    isFeatureEnabledSpy.mockReturnValue(false);
    renderNav();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
  });
});
