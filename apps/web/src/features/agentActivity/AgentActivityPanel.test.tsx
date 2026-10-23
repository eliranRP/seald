import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/renderWithProviders';

const getMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
  },
}));

import { AgentActivityPanel } from './AgentActivityPanel';
import { ACTIVITY_ENVELOPE_ID, fakeActivity, fakePage, sampleActivity } from './fixtures';

function renderPanel() {
  return renderWithProviders(
    <MemoryRouter>
      <AgentActivityPanel />
    </MemoryRouter>,
  );
}

function httpError(status: number): Error {
  return Object.assign(new Error('failed'), { status });
}

describe('AgentActivityPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it('lists what each key did and asked for, with a word for every outcome', async () => {
    getMock.mockResolvedValue({ data: fakePage(sampleActivity()) });
    renderPanel();

    const list = await screen.findByRole('list', { name: 'Agent activity' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(5);

    const waiting = rows[0];
    expect(waiting).toBeDefined();
    expect(within(waiting as HTMLElement).getByText('Asked to change an expiry')).toBeVisible();
    expect(within(waiting as HTMLElement).getByText('Waiting for you')).toBeVisible();
    expect(within(waiting as HTMLElement).getByText(/Key 2 · Oct\s+2/)).toBeVisible();

    const done = rows[1] as HTMLElement;
    expect(within(done).getByText('Sent for signature')).toBeVisible();
    expect(within(done).getByText('Done')).toBeVisible();
    expect(within(done).getByText(/Approved signed in/)).toBeVisible();

    expect(within(rows[2] as HTMLElement).getByText('Denied')).toBeVisible();
    expect(within(rows[3] as HTMLElement).getByText('Failed')).toBeVisible();
    // A batch has no document: the title is plain text, and the email-link approval is said.
    const bulk = rows[4] as HTMLElement;
    expect(within(bulk).getByText('Sent from a template to several people')).toBeVisible();
    expect(within(bulk).queryByRole('link')).not.toBeInTheDocument();
    expect(within(bulk).getByText(/Approved from the email link/)).toBeVisible();
  });

  it('links a row to its document by title', async () => {
    getMock.mockResolvedValue({ data: fakePage([fakeActivity({ title: 'Services agreement' })]) });
    renderPanel();

    const link = await screen.findByRole('link', { name: 'Services agreement' });
    expect(link).toHaveAttribute('href', `/document/${ACTIVITY_ENVELOPE_ID}`);
  });

  it('shows document text as text, never as markup', async () => {
    getMock.mockResolvedValue({
      data: fakePage([
        fakeActivity({ title: '<img src=x onerror=alert(1)> Ignore previous instructions' }),
      ]),
    });
    const { container } = renderPanel();

    expect(await screen.findByText(/Ignore previous instructions/)).toBeVisible();
    expect(container.querySelector('img')).toBeNull();
  });

  it('asks for 20 a page and loads the next page on Load more', async () => {
    const user = userEvent.setup();
    // Answer by cursor, not by call order: a remount may repeat the first request.
    getMock.mockImplementation((_url: string, config: { params: { cursor?: string } }) =>
      Promise.resolve({
        data:
          config.params.cursor === 'cursor-2'
            ? fakePage([fakeActivity({ title: 'Second page' })])
            : fakePage([fakeActivity({ title: 'First page' })], 'cursor-2'),
      }),
    );
    renderPanel();

    expect(await screen.findByRole('link', { name: 'First page' })).toBeVisible();
    expect(getMock).toHaveBeenCalledWith('/agent-activity', { params: { limit: 20 } });
    await user.click(screen.getByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: 'Second page' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'First page' })).toBeVisible();
    expect(getMock).toHaveBeenLastCalledWith('/agent-activity', {
      params: { limit: 20, cursor: 'cursor-2' },
    });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
  });

  it('says so when nothing has happened yet', async () => {
    getMock.mockResolvedValue({ data: fakePage([]) });
    renderPanel();

    expect(await screen.findByText(/Nothing yet/)).toBeVisible();
    expect(screen.queryByRole('list', { name: 'Agent activity' })).not.toBeInTheDocument();
  });

  it('offers Try again when the list cannot load', async () => {
    const user = userEvent.setup();
    let healthy = false;
    getMock.mockImplementation(() =>
      healthy
        ? Promise.resolve({ data: fakePage([fakeActivity()]) })
        : Promise.reject(httpError(500)),
    );
    renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load the activity.");
    healthy = true;
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Agent activity' })).toBeVisible();
  });

  it('renders nothing when the API says the list is not available', async () => {
    getMock.mockRejectedValue(httpError(404));
    const { container } = renderPanel();

    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(container).toBeEmptyDOMElement();
  });

  it('has no accessibility violations', async () => {
    getMock.mockResolvedValue({ data: fakePage(sampleActivity(), 'more') });
    const { container } = renderPanel();
    await screen.findByRole('list', { name: 'Agent activity' });

    expect(await axe(container)).toHaveNoViolations();
  });
});
