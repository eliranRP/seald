import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithTheme } from '../../test/renderWithTheme';
import { MAINTENANCE_POLL_MS, MaintenanceGate } from '../../layout/MaintenanceGate';
import { getSystemState, resetSystemState, setMaintenance } from '../../lib/system/systemStore';
import { MaintenancePage } from './MaintenancePage';

afterEach(() => {
  resetSystemState();
  vi.unstubAllEnvs();
});

describe('MaintenancePage', () => {
  it('says Back soon with the default eta', () => {
    renderWithTheme(<MaintenancePage />);
    expect(screen.getByRole('heading', { name: 'Back soon' })).toBeInTheDocument();
    expect(screen.getByText('About 15 min')).toBeInTheDocument();
    // Says what happened and that nothing is needed from the visitor.
    expect(screen.getByText(/reloads by itself/)).toBeInTheDocument();
  });

  it('uses the eta the API sent', () => {
    renderWithTheme(<MaintenancePage etaMinutes={40} />);
    expect(screen.getByText('About 40 min')).toBeInTheDocument();
  });

  it('links the status page only when one is configured', () => {
    const { unmount } = renderWithTheme(<MaintenancePage />);
    expect(screen.queryByRole('link', { name: 'Status page' })).not.toBeInTheDocument();
    unmount();
    vi.stubEnv('VITE_STATUS_PAGE_URL', 'https://status.example.test');
    renderWithTheme(<MaintenancePage />);
    expect(screen.getByRole('link', { name: 'Status page' })).toHaveAttribute(
      'href',
      'https://status.example.test',
    );
  });
});

describe('MaintenanceGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('renders the app until maintenance is flagged, then the maintenance page', () => {
    renderWithTheme(
      <MaintenanceGate>
        <div>the app</div>
      </MaintenanceGate>,
    );
    expect(screen.getByText('the app')).toBeInTheDocument();
    act(() => {
      setMaintenance(true, 20);
    });
    expect(screen.queryByText('the app')).not.toBeInTheDocument();
    expect(screen.getByText('About 20 min')).toBeInTheDocument();
  });

  it('lifts the page once the health check answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    renderWithTheme(
      <MaintenanceGate>
        <div>the app</div>
      </MaintenanceGate>,
    );
    act(() => {
      setMaintenance(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAINTENANCE_POLL_MS);
    });
    expect(getSystemState().maintenance.active).toBe(false);
    expect(screen.getByText('the app')).toBeInTheDocument();
  });
});
