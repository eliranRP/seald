import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { DownloadSplitButton } from './DownloadSplitButton';

const base = {
  sealed: true,
  sealing: false,
  originalAvailable: true,
  gdriveEnabled: false,
  multiDoc: false,
  busy: null,
} as const;

describe('DownloadSplitButton', () => {
  it('opens the options in a dropdown menu by default', async () => {
    renderWithProviders(<DownloadSplitButton {...base} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download options' }));
    expect(screen.getByRole('menu', { name: 'Download' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens the options in a bottom sheet in the phone bar, so none fall off-screen', async () => {
    const onSelect = vi.fn();
    renderWithProviders(<DownloadSplitButton {...base} fullWidth asSheet onSelect={onSelect} />);
    await userEvent.click(screen.getByRole('button', { name: 'Download options' }));
    expect(screen.queryByRole('menu')).toBeNull();
    const sheet = screen.getByRole('dialog', { name: 'Download' });
    await userEvent.click(within(sheet).getByRole('button', { name: 'Audit trail' }));
    expect(onSelect).toHaveBeenCalledWith('audit');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
