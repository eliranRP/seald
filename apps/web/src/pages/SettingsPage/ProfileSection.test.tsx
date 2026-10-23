import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DEFAULT_USER_SETTINGS } from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const patchMock = vi.fn();
vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...a: unknown[]): unknown => getMock(...a),
    patch: (...a: unknown[]): unknown => patchMock(...a),
  },
}));
const updateUser = vi.fn();
vi.mock('@/lib/supabase/supabaseClient', () => ({
  supabase: { auth: { updateUser: (...a: unknown[]): unknown => updateUser(...a) } },
}));

import { ProfileSection } from './ProfileSection';

describe('ProfileSection', () => {
  beforeEach(() => {
    getMock.mockReset();
    patchMock.mockReset();
    updateUser.mockReset().mockResolvedValue({});
    getMock.mockResolvedValue({
      data: { ...DEFAULT_USER_SETTINGS, display_name: 'Eliran Azulay' },
    });
  });

  it('shows the saved name and the read-only email, with no Save bar', async () => {
    renderWithProviders(<ProfileSection />);
    expect(await screen.findByDisplayValue('Eliran Azulay')).toBeInTheDocument();
    expect(screen.getByText('jamie@seald.app')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('shows the Google badge only for a Google sign-in', async () => {
    const session = { user: { app_metadata: { provider: 'google' } } };
    renderWithProviders(<ProfileSection />, { auth: { session: session as never } });
    expect(await screen.findByText('Google')).toBeInTheDocument();
  });

  it('shows the Save bar once the name changes, and Cancel puts it back', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileSection />);
    const input = await screen.findByDisplayValue('Eliran Azulay');
    await user.clear(input);
    await user.type(input, 'Eliran A.');
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByDisplayValue('Eliran Azulay')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('Save patches the name, updates the auth profile and shows Saved', async () => {
    const user = userEvent.setup();
    patchMock.mockResolvedValue({ data: { ...DEFAULT_USER_SETTINGS, display_name: 'Eliran A.' } });
    renderWithProviders(<ProfileSection />);
    const input = await screen.findByDisplayValue('Eliran Azulay');
    await user.clear(input);
    await user.type(input, '  Eliran A. ');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/me/settings', { display_name: 'Eliran A.' }),
    );
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ data: { name: 'Eliran A.' } });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  });

  it('blocks Save for a name under 2 characters', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileSection />);
    const input = await screen.findByDisplayValue('Eliran Azulay');
    await user.clear(input);
    await user.type(input, 'E');
    expect(screen.getByRole('alert')).toHaveTextContent('at least 2');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says so when the save fails and keeps the bar', async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error('boom'));
    renderWithProviders(<ProfileSection />);
    const input = await screen.findByDisplayValue('Eliran Azulay');
    await user.clear(input);
    await user.type(input, 'New Name');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText("Couldn't save. Try again.")).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });
});
