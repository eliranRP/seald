import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';
import * as flagsModule from 'shared';
import { MWMobileNav } from './MWMobileNav';

describe('MWMobileNav — Integrations item', () => {
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

  it('shows Integrations item in the menu when gdriveIntegration is on', async () => {
    const user = userEvent.setup();
    isFeatureEnabledSpy.mockReturnValue(true);
    renderNav();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.getByRole('button', { name: /integrations/i })).toBeInTheDocument();
  });

  it('hides Integrations item when gdriveIntegration is off', async () => {
    const user = userEvent.setup();
    isFeatureEnabledSpy.mockReturnValue(false);
    renderNav();

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    expect(screen.queryByRole('button', { name: /integrations/i })).not.toBeInTheDocument();
  });
});
