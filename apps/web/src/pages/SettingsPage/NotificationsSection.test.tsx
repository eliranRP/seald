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

import { NotificationsSection } from './NotificationsSection';

describe('NotificationsSection', () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue({ data: DEFAULT_USER_SETTINGS });
    patchMock
      .mockReset()
      .mockImplementation((_url: string, body: object) =>
        Promise.resolve({ data: { ...DEFAULT_USER_SETTINGS, ...body } }),
      );
  });

  it('has Completed and Declined always on and not changeable', async () => {
    renderWithProviders(<NotificationsSection />);
    const completed = await screen.findByRole('switch', { name: 'Completed' });
    const declined = screen.getByRole('switch', { name: 'Declined, expired, bounced' });
    expect(completed).toBeChecked();
    expect(completed).toBeDisabled();
    expect(declined).toBeChecked();
    expect(declined).toBeDisabled();
  });

  it('starts with Someone signs on and shows no Daily summary switch yet', async () => {
    renderWithProviders(<NotificationsSection />);
    expect(await screen.findByRole('switch', { name: 'Someone signs' })).toBeChecked();
    // Hidden until the daily-summary email exists.
    expect(screen.queryByRole('switch', { name: 'Daily summary' })).not.toBeInTheDocument();
  });

  it('saves the Someone signs switch at once', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsSection />);
    const sw = await screen.findByRole('switch', { name: 'Someone signs' });
    await user.click(sw);
    expect(sw).not.toBeChecked();
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/me/settings', { notify: { signed: false } }),
    );
  });

  it('rolls the switch back when the save fails', async () => {
    const user = userEvent.setup();
    patchMock.mockRejectedValue(new Error('nope'));
    renderWithProviders(<NotificationsSection />);
    const sw = await screen.findByRole('switch', { name: 'Someone signs' });
    await user.click(sw);
    await waitFor(() => expect(sw).toBeChecked());
    // The rollback is announced, with the next step, instead of happening silently.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save that change, so it was put back.",
    );
  });

  it('confirms a saved change', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsSection />);
    expect(await screen.findByRole('status')).toHaveTextContent('Changes save as you make them.');
    await user.click(await screen.findByRole('switch', { name: 'Someone signs' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved'));
  });

  it('shows the defaults and saves a new reminder cadence', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsSection />);
    expect(await screen.findByRole('radio', { name: '3 days' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '30' })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: 'Weekly' }));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/me/settings', { reminder_default: 'weekly' }),
    );
  });

  it('saves a new expiry as a number of days', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NotificationsSection />);
    await user.click(await screen.findByRole('radio', { name: '60 days' }));
    await waitFor(() =>
      expect(patchMock).toHaveBeenCalledWith('/me/settings', { expiry_default_days: 60 }),
    );
  });
});
