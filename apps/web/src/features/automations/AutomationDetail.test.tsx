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
const deleteMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
    patch: (...args: unknown[]): unknown => patchMock(...args),
    delete: (...args: unknown[]): unknown => deleteMock(...args),
  },
}));

import { AutomationDetail } from './AutomationDetail';
import {
  FAKE_SECRET,
  fakeAutomation,
  fakeDriveAutomation,
  fakePermanentRun,
  fakeRetryableRun,
  fakeRun,
} from './fixtures';

const ID = '00000000-0000-4000-8000-0000000000a1';
const DRIVE_ID = '00000000-0000-4000-8000-0000000000a2';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderDetail(id = ID) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/settings/automations/${id}`]}>
      <Routes>
        <Route
          path="/settings/automations/:id"
          element={
            <AutomationDetail
              id={id}
              listPath="/settings/automations"
              integrationsPath="/settings/integrations"
            />
          }
        />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

/** One GET handler for the recipe and its runs. */
function serve(
  automation: ReturnType<typeof fakeAutomation> | null,
  runs: ReadonlyArray<ReturnType<typeof fakeRun>> = [],
  nextCursor: string | null = null,
): void {
  getMock.mockImplementation((url: string) => {
    if (url.endsWith('/runs')) {
      return Promise.resolve({ data: { items: runs, next_cursor: nextCursor } });
    }
    if (automation === null) {
      return Promise.reject(Object.assign(new Error('Not Found'), { status: 404 }));
    }
    return Promise.resolve({ data: automation });
  });
}

describe('AutomationDetail', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
    vi.spyOn(shared, 'isFeatureEnabled').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows where it goes and "Secret set", never the address or the secret', async () => {
    serve(fakeAutomation());
    const { container } = renderDetail();

    expect(
      await screen.findByRole('heading', { name: 'Send a webhook when sealed' }),
    ).toBeVisible();
    expect(screen.getByText('hooks.example.com')).toBeInTheDocument();
    expect(screen.getByText('Secret set')).toBeInTheDocument();
    expect(screen.getByText('Document sealed')).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/https:\/\//);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('says so when the automation does not exist for this owner', async () => {
    serve(null);
    renderDetail();
    expect(await screen.findByText("We couldn't find that automation.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to automations' })).toHaveAttribute(
      'href',
      '/settings/automations',
    );
  });

  it('Rotate secret shows the new secret once, with the 24 hour note', async () => {
    const user = userEvent.setup();
    serve(fakeAutomation());
    postMock.mockResolvedValue({
      data: { secret: FAKE_SECRET, previous_retires_at: '2026-10-24T10:00:00.000Z' },
    });
    renderDetail();

    await user.click(await screen.findByRole('button', { name: 'Rotate secret' }));
    expect(postMock).toHaveBeenCalledWith(`/automations/${ID}/rotate-secret`);
    const dialog = await screen.findByRole('dialog', { name: 'Your new signing secret' });
    expect(within(dialog).getByLabelText('Secret value')).toHaveTextContent(FAKE_SECRET);
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(
      within(dialog).getByText('The old secret keeps working for 24 hours.'),
    ).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(FAKE_SECRET, { exact: false })).not.toBeInTheDocument();
  });

  it('only a webhook has a secret to rotate', async () => {
    serve(fakeDriveAutomation(), []);
    renderDetail(DRIVE_ID);
    await screen.findByRole('heading', { name: 'Save sealed copies to Drive' });
    expect(screen.queryByRole('button', { name: 'Rotate secret' })).not.toBeInTheDocument();
    expect(screen.getByText('My Drive / Seald')).toBeInTheDocument();
  });

  it('the switch turns it off with PATCH enabled', async () => {
    const user = userEvent.setup();
    serve(fakeAutomation());
    patchMock.mockResolvedValue({ data: { automation: fakeAutomation({ enabled: false }) } });
    renderDetail();

    await user.click(await screen.findByRole('switch', { name: 'Send a webhook when sealed' }));
    expect(patchMock).toHaveBeenCalledWith(`/automations/${ID}`, { enabled: false });
  });

  describe('run history', () => {
    it('is empty with a plain line', async () => {
      serve(fakeAutomation(), []);
      renderDetail();
      expect(
        await screen.findByText('Nothing has run yet. Send a document that matches this recipe.'),
      ).toBeInTheDocument();
    });

    it('a temporary failure shows Failed and Retry, and no Fix', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation(), [fakeRetryableRun(), fakeRun()]);
      postMock.mockResolvedValue({
        data: { status: 'queued', run: fakeRetryableRun({ status: 'queued', status_word: null }) },
      });
      renderDetail();

      const list = await screen.findByRole('list', { name: 'Runs' });
      const rows = within(list).getAllByRole('listitem');
      expect(within(rows[0] as HTMLElement).getByText('Failed')).toBeInTheDocument();
      expect(
        within(rows[0] as HTMLElement).getByText(/kept failing\. Retry is safe\./),
      ).toBeInTheDocument();
      expect(within(rows[1] as HTMLElement).getByText('Done')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Fix/ })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /^Retry/ }));
      expect(postMock).toHaveBeenCalledWith(
        `/automations/${ID}/runs/00000000-0000-4000-8000-0000000000c2/retry`,
      );
    });

    it('a permanent failure shows Failed and Fix, and no Retry; Fix moves to the address field', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation(), [fakePermanentRun()]);
      renderDetail();

      const fix = await screen.findByRole('button', { name: /^Fix/ });
      expect(screen.queryByRole('button', { name: /^Retry/ })).not.toBeInTheDocument();
      await user.click(fix);
      expect(postMock).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: 'Webhook address' })).toHaveFocus();
    });

    it('a Drive connection problem sends Fix to the integrations page', async () => {
      const user = userEvent.setup();
      serve(fakeDriveAutomation(), [
        fakePermanentRun({
          automation_id: DRIVE_ID,
          action: 'gdrive_upload',
          failure_slug: 'reconnect_required',
          failure_message: 'Drive needs to be reconnected.',
        }),
      ]);
      renderDetail(DRIVE_ID);

      await user.click(await screen.findByRole('button', { name: /^Fix/ }));
      expect(await screen.findByText('elsewhere')).toBeInTheDocument();
      expect(screen.getByTestId('where')).toHaveTextContent('/settings/integrations');
    });

    it('loads the next page on demand', async () => {
      const user = userEvent.setup();
      getMock.mockImplementation((url: string, opts?: { params?: { cursor?: string } }) => {
        if (!url.endsWith('/runs')) return Promise.resolve({ data: fakeAutomation() });
        return Promise.resolve({
          data: opts?.params?.cursor
            ? {
                items: [fakeRun({ id: '00000000-0000-4000-8000-0000000000d2' })],
                next_cursor: null,
              }
            : { items: [fakeRun()], next_cursor: 'next' },
        });
      });
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Load more' }));
      await waitFor(() => {
        expect(
          within(screen.getByRole('list', { name: 'Runs' })).getAllByRole('listitem'),
        ).toHaveLength(2);
      });
      expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    });

    it('explains a refused retry', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation(), [fakeRetryableRun()]);
      postMock.mockRejectedValue(
        Object.assign(new Error('x'), { status: 409, code: 'retry_not_allowed' }),
      );
      renderDetail();

      await user.click(await screen.findByRole('button', { name: /^Retry/ }));
      expect(await screen.findByRole('alert')).toHaveTextContent("This run can't be retried.");
    });
  });

  describe('edit', () => {
    it('sends only what changed, and a blank address keeps the current one', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      patchMock.mockResolvedValue({
        data: { automation: fakeAutomation({ name: 'Billing hook' }) },
      });
      renderDetail();

      const form = await screen.findByRole('form', { name: 'Edit this automation' });
      expect(within(form).getByRole('button', { name: 'Save' })).toBeDisabled();
      expect(within(form).getByRole('textbox', { name: 'Webhook address' })).toHaveAttribute(
        'placeholder',
        'Leave blank to keep hooks.example.com',
      );
      const name = within(form).getByRole('textbox', { name: 'Name' });
      await user.clear(name);
      await user.type(name, 'Billing hook');
      await user.click(within(form).getByRole('button', { name: 'Save' }));

      expect(patchMock).toHaveBeenCalledWith(`/automations/${ID}`, { name: 'Billing hook' });
    });

    it('a new address is sent as url, and a refused one says why', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      patchMock.mockRejectedValue(
        Object.assign(new Error('x'), { status: 400, code: 'webhook_url_blocked' }),
      );
      renderDetail();

      const form = await screen.findByRole('form', { name: 'Edit this automation' });
      await user.type(
        within(form).getByRole('textbox', { name: 'Webhook address' }),
        'https://10.0.0.1/x',
      );
      await user.click(within(form).getByRole('button', { name: 'Save' }));
      expect(patchMock).toHaveBeenCalledWith(`/automations/${ID}`, { url: 'https://10.0.0.1/x' });
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Seald can't send to that address.",
      );
    });
  });

  describe('Advanced', () => {
    it('Send test event posts the test and reports the answer', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      postMock.mockResolvedValue({
        data: {
          ok: true,
          event_id: 'evt_1',
          type: 'automation.test',
          response_status: 200,
          duration_ms: 42,
          response_truncated: false,
          error: null,
          transient: false,
        },
      });
      renderDetail();

      expect(screen.queryByRole('button', { name: 'Send test event' })).not.toBeInTheDocument();
      await user.click(await screen.findByRole('button', { name: 'Advanced automation options' }));
      await user.click(screen.getByRole('button', { name: 'Send test event' }));
      expect(postMock).toHaveBeenCalledWith(`/automations/${ID}/test`);
      expect(await screen.findByText('The address answered 200 in 42 ms.')).toBeInTheDocument();
    });

    it('a test that did not reach the address says why in plain words', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      postMock.mockResolvedValue({
        data: {
          ok: false,
          event_id: 'evt_1',
          type: 'automation.test',
          response_status: 404,
          duration_ms: 12,
          response_truncated: false,
          error: 'http_404',
          transient: false,
        },
      });
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Advanced automation options' }));
      await user.click(screen.getByRole('button', { name: 'Send test event' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('HTTP 404');
    });

    it('keeps the test off while an app-made automation waits for approval', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation({ enabled: false, awaiting_approval: true }));
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Advanced automation options' }));
      expect(screen.getByRole('button', { name: 'Send test event' })).toBeDisabled();
      expect(screen.getByText('Turn the automation on before you test it.')).toBeInTheDocument();
      expect(screen.getByText(/An app asked to set this up/)).toBeInTheDocument();
      expect(postMock).not.toHaveBeenCalled();
    });

    it('a 409 from the API reads as waiting for approval', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      postMock.mockRejectedValue(
        Object.assign(new Error('x'), { status: 409, code: 'recipe_not_approved' }),
      );
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Advanced automation options' }));
      await user.click(screen.getByRole('button', { name: 'Send test event' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('waiting for your approval');
    });

    it('Delete asks once, then removes it and returns to the list', async () => {
      const user = userEvent.setup();
      serve(fakeAutomation());
      deleteMock.mockResolvedValue({ data: undefined });
      renderDetail();

      await user.click(await screen.findByRole('button', { name: 'Advanced automation options' }));
      await user.click(screen.getByRole('button', { name: 'Delete automation' }));
      expect(deleteMock).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Delete' }));
      expect(deleteMock).toHaveBeenCalledWith(`/automations/${ID}`);
      expect(await screen.findByText('elsewhere')).toBeInTheDocument();
    });
  });
});
