import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import * as shared from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();
const postMock = vi.fn();
const patchMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
    patch: (...args: unknown[]): unknown => patchMock(...args),
  },
}));

import { AutomationsPanel } from './AutomationsPanel';
import { fakeAutomation, fakeDriveAutomation } from './fixtures';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderPanel() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/settings/automations']}>
      <Routes>
        <Route path="*" element={<AutomationsPanel basePath="/settings/automations" />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function listReturns(items: ReadonlyArray<ReturnType<typeof fakeAutomation>>): void {
  getMock.mockResolvedValue({ data: { items, next_cursor: null } });
}

function httpError(status: number, code?: string): Error {
  return Object.assign(new Error('failed'), { status, ...(code ? { code } : {}) });
}

describe('AutomationsPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    vi.spyOn(shared, 'isFeatureEnabled').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('with no automations the recipe gallery is the page, and nothing says "coming soon"', async () => {
    listReturns([]);
    const { container } = renderPanel();

    const gallery = await screen.findByRole('region', { name: 'Pick one to start' });
    expect(within(gallery).getAllByRole('button', { name: /^Use this:/ })).toHaveLength(4);
    expect(screen.queryByRole('list', { name: 'Your automations' })).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/coming soon/i);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('the Drive card names My Drive / Seald, and one tap saves it with no picker', async () => {
    const user = userEvent.setup();
    listReturns([]);
    postMock.mockResolvedValue({ data: { automation: fakeDriveAutomation() } });
    renderPanel();

    const card = await screen.findByRole('button', {
      name: 'Use this: Save sealed copies to Drive',
    });
    expect(screen.getByText(/My Drive \/ Seald/)).toBeInTheDocument();
    await user.click(card);

    expect(postMock).toHaveBeenCalledWith('/automations', { recipe: 'sealed_save_drive' });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Turned on: Save sealed copies to Drive.',
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides the Drive card while the Drive integration is off', async () => {
    vi.spyOn(shared, 'isFeatureEnabled').mockImplementation((flag) => flag !== 'gdriveIntegration');
    listReturns([]);
    renderPanel();

    await screen.findByRole('region', { name: 'Pick one to start' });
    expect(screen.queryByRole('button', { name: /Drive/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Use this:/ })).toHaveLength(3);
  });

  it('a webhook card goes to the address form', async () => {
    const user = userEvent.setup();
    listReturns([]);
    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Use this: Send a webhook when sealed' }),
    );
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/settings/automations/new?recipe=sealed_webhook',
    );
    expect(postMock).not.toHaveBeenCalled();
  });

  it('shows a plain reason when a one-tap create fails', async () => {
    const user = userEvent.setup();
    listReturns([]);
    postMock.mockRejectedValue(httpError(409, 'automation_limit_reached'));
    renderPanel();

    await user.click(
      await screen.findByRole('button', { name: 'Use this: Email me when someone declines' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have 10 automations. Delete one to add another.',
    );
  });

  it('lists automations with a switch each, the last-run word, and Secret set', async () => {
    listReturns([
      fakeAutomation({
        last_run: { status: 'done', status_word: 'Done', created_at: '2026-10-02T10:00:00.000Z' },
      }),
      fakeDriveAutomation({
        enabled: false,
        status_word: 'Off',
        last_run: {
          status: 'failed',
          status_word: 'Failed',
          created_at: '2026-10-02T10:00:00.000Z',
        },
      }),
    ]);
    const { container } = renderPanel();

    const list = await screen.findByRole('list', { name: 'Your automations' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0] as HTMLElement).getByText('Done')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Secret set')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Off')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).queryByText('Failed')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Send a webhook when sealed' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Save sealed copies to Drive' })).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Send a webhook when sealed' })).toHaveAttribute(
      'href',
      '/settings/automations/00000000-0000-4000-8000-0000000000a1',
    );
    // The gallery moves below the list for the next one.
    expect(screen.getByRole('region', { name: 'Add another' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('keeps the count behind Advanced', async () => {
    const user = userEvent.setup();
    listReturns([fakeAutomation()]);
    renderPanel();

    await screen.findByRole('list', { name: 'Your automations' });
    expect(screen.queryByText('1 of 10 automations')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Advanced list options' }));
    expect(screen.getByText('1 of 10 automations')).toBeInTheDocument();
  });

  it('the switch sends PATCH enabled and reads the new state back', async () => {
    const user = userEvent.setup();
    listReturns([fakeAutomation()]);
    patchMock.mockResolvedValue({ data: { automation: fakeAutomation({ enabled: false }) } });
    renderPanel();

    await user.click(await screen.findByRole('switch', { name: 'Send a webhook when sealed' }));
    expect(patchMock).toHaveBeenCalledWith('/automations/00000000-0000-4000-8000-0000000000a1', {
      enabled: false,
    });
    // The list is read again after the save.
    await waitFor(() => {
      expect(getMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows Waiting for approval for an automation an app set up', async () => {
    listReturns([fakeAutomation({ enabled: false, awaiting_approval: true })]);
    renderPanel();

    expect(await screen.findByText('Waiting for approval')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Send a webhook when sealed' })).not.toBeChecked();
  });

  it('at the limit it stops offering new ones', async () => {
    listReturns(
      Array.from({ length: 10 }, (_, i) =>
        fakeAutomation({ id: `00000000-0000-4000-8000-00000000010${i}`, name: `Hook ${i + 1}` }),
      ),
    );
    renderPanel();

    await screen.findByRole('list', { name: 'Your automations' });
    expect(screen.queryByRole('region', { name: 'Add another' })).not.toBeInTheDocument();
    expect(
      screen.getByText('You have 10 automations. Delete one to add another.'),
    ).toBeInTheDocument();
  });

  it('reads a 404 as not available', async () => {
    getMock.mockRejectedValue(httpError(404));
    renderPanel();
    expect(await screen.findByText('Not available.')).toBeInTheDocument();
  });

  it('offers a retry when the list cannot load', async () => {
    const user = userEvent.setup();
    getMock.mockRejectedValueOnce(httpError(500));
    listReturns([]);
    renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your automations.");
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Pick one to start' })).toBeInTheDocument();
  });
});
