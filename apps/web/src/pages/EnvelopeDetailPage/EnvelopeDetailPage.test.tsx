import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, within, waitFor, type RenderResult } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// The Drive save orchestration (OAuth popup, folder picker, upload) lives in
// `useSaveEnvelopeToGdrive`; the page only maps its outcome to a toast.
const saveMock = vi.fn();
vi.mock('@/features/gdriveExport', () => ({
  useSaveEnvelopeToGdrive: () => ({ inFlight: false, save: saveMock }),
}));

import { apiClient } from '../../lib/api/apiClient';
import { EnvelopeDetailPage } from './EnvelopeDetailPage';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const post = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const patch = apiClient.patch as unknown as ReturnType<typeof vi.fn>;
const del = apiClient.delete as unknown as ReturnType<typeof vi.fn>;

function renderAt(id: string): RenderResult {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[`/document/${id}`]}>
            <Routes>
              <Route path="/document/:id" element={children as ReactElement} />
              <Route path="/documents" element={<div>BACK</div>} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<EnvelopeDetailPage />, { wrapper: Wrapper });
}

const HOUR = 3_600_000;
const ago = (ms: number): string => new Date(Date.now() - ms).toISOString();

const YOU = {
  id: 'you',
  email: 'eliran@seald.co',
  name: 'Eliran Azulay',
  color: '#4F46E5',
  role: 'signatory',
  signing_order: 1,
  status: 'completed',
  viewed_at: ago(48 * HOUR),
  tc_accepted_at: ago(48 * HOUR),
  signed_at: ago(48 * HOUR),
  declined_at: null,
};
const HANNAH = {
  id: 'hannah',
  email: 'hannah@quill.vc',
  name: 'Hannah Wills',
  color: '#10B981',
  role: 'signatory',
  signing_order: 2,
  status: 'viewing',
  viewed_at: ago(2 * HOUR),
  tc_accepted_at: null,
  signed_at: null,
  declined_at: null,
};
const ALEX = {
  id: 'alex',
  email: 'alex@quill.vc',
  name: 'Alex Reyes',
  color: '#F59E0B',
  role: 'signatory',
  signing_order: 3,
  status: 'awaiting',
  viewed_at: null,
  tc_accepted_at: null,
  signed_at: null,
  declined_at: null,
};

interface Setup {
  readonly status?: string;
  readonly signers?: ReadonlyArray<Record<string, unknown>>;
  readonly events?: ReadonlyArray<Record<string, unknown>>;
  readonly chain_intact?: boolean;
  readonly extra?: Record<string, unknown>;
  readonly contacts?: ReadonlyArray<Record<string, unknown>>;
}

function mockApi(setup: Setup = {}): void {
  get.mockImplementation((url: string) => {
    if (url.endsWith('/events')) {
      return Promise.resolve({
        data: { events: setup.events ?? [], chain_intact: setup.chain_intact ?? true },
        status: 200,
      });
    }
    if (url === '/contacts') return Promise.resolve({ data: setup.contacts ?? [], status: 200 });
    if (url.endsWith('/download')) {
      return Promise.resolve({
        data: { url: 'https://signed.example/x.pdf', kind: 'x' },
        status: 200,
      });
    }
    return Promise.resolve({
      data: {
        id: 'env-1',
        owner_id: 'u',
        title: 'NDA — Quill Capital',
        short_code: 'NQ7C2D8KF4PXA',
        status: setup.status ?? 'awaiting_others',
        original_pages: 3,
        expires_at: '2030-01-01T00:00:00Z',
        tc_version: '1',
        privacy_version: '1',
        sent_at: '2026-04-01T00:00:00Z',
        completed_at: setup.status === 'completed' ? '2026-04-02T00:00:00Z' : null,
        signers: setup.signers ?? [YOU, HANNAH, ALEX],
        fields: [],
        tags: ['Legal'],
        created_at: '2026-04-01T00:00:00Z',
        updated_at: '2026-04-01T00:00:00Z',
        ...setup.extra,
      },
      status: 200,
    });
  });
}

function throttled(): Error {
  return Object.assign(new Error('remind_throttled'), { response: { status: 429 } });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
  saveMock.mockReset();
});

async function ready(): Promise<ReturnType<typeof userEvent.setup>> {
  await screen.findByRole('heading', { name: 'NDA — Quill Capital' });
  return userEvent.setup();
}

describe('EnvelopeDetailPage', () => {
  describe('states', () => {
    it('waiting: header, summary and one tracker row per signer', async () => {
      mockApi();
      renderAt('env-1');
      await ready();
      expect(screen.getByText('Waiting on 2')).toBeInTheDocument();
      expect(screen.getByText('NQ7C2D8KF4PXA')).toBeInTheDocument();
      expect(screen.getByText('3 pages')).toBeInTheDocument();
      expect(screen.getByText('1 / 3')).toBeInTheDocument();
      expect(screen.getByRole('progressbar', { name: 'Signed' })).toHaveAttribute(
        'aria-valuenow',
        '1',
      );
      expect(screen.getByText(/^Expires /)).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Auto-remind' })).toBeChecked();
      const signers = screen.getByRole('region', { name: 'Signers' });
      expect(within(signers).getByText('Hannah Wills')).toBeInTheDocument();
      expect(within(signers).getByText('Opened · 2h')).toBeInTheDocument();
      expect(within(signers).getByText(/^Signed · /)).toBeInTheDocument();
    });

    it('the tracker spells each state of the track for assistive tech', async () => {
      mockApi();
      renderAt('env-1');
      await ready();
      const hannah = screen.getByRole('list', { name: 'Progress for Hannah Wills' });
      expect(within(hannah).getByText('Opened: done')).toBeInTheDocument();
      expect(within(hannah).getByText('Signed: in progress')).toBeInTheDocument();
      const alex = screen.getByRole('list', { name: 'Progress for Alex Reyes' });
      expect(within(alex).getByText('Opened: in progress')).toBeInTheDocument();
    });

    it('sealing: full bar, Sealing badge, Download disabled, no Remind all', async () => {
      mockApi({
        status: 'sealing',
        signers: [YOU, { ...HANNAH, status: 'completed', signed_at: ago(HOUR) }],
      });
      renderAt('env-1');
      await ready();
      expect(screen.getByText('Sealing')).toBeInTheDocument();
      expect(screen.getByText('2 / 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Remind all' })).not.toBeInTheDocument();
      expect(screen.getAllByText('about 1 min').length).toBeGreaterThan(0);
    });

    it('sealed: Verify page chip, primary Download, no reminders, no auto-remind switch', async () => {
      mockApi({
        status: 'completed',
        signers: [YOU, { ...HANNAH, status: 'completed', signed_at: ago(HOUR) }],
      });
      renderAt('env-1');
      await ready();
      expect(screen.getByText('Sealed', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Verify page' })).toHaveAttribute(
        'href',
        '/verify/NQ7C2D8KF4PXA',
      );
      expect(screen.queryByRole('button', { name: 'Remind all' })).not.toBeInTheDocument();
      expect(screen.queryByRole('switch', { name: 'Auto-remind' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    });

    it('declined: red row and no Remind buttons', async () => {
      mockApi({
        status: 'declined',
        signers: [YOU, { ...ALEX, status: 'declined', declined_at: ago(HOUR) }],
      });
      renderAt('env-1');
      await ready();
      expect(screen.getByText('Declined', { selector: 'span' })).toBeInTheDocument();
      expect(screen.getByText('Declined · 1h')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Remind/ })).not.toBeInTheDocument();
    });

    it('expired: rows say Expired and the summary says when', async () => {
      mockApi({ status: 'expired' });
      renderAt('env-1');
      await ready();
      expect(screen.getAllByText('Expired').length).toBeGreaterThan(1);
      expect(screen.getByText(/^Expired /)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remind all' })).not.toBeInTheDocument();
    });

    it('withdrawn: badge reads Withdrawn and pending rows are greyed', async () => {
      mockApi({ status: 'canceled' });
      renderAt('env-1');
      await ready();
      expect(screen.getAllByText('Withdrawn').length).toBeGreaterThan(0);
      expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
      const alex = screen.getByRole('list', { name: 'Progress for Alex Reyes' });
      expect(within(alex).getByText('Signed: skipped')).toBeInTheDocument();
    });

    it('shows skeletons while loading and a not-found card on error', async () => {
      get.mockImplementation(() => new Promise(() => {}));
      const { container, unmount } = renderAt('env-1');
      expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
      unmount();
      get.mockReset();
      get.mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));
      renderAt('env-1');
      expect(await screen.findByText('Document not found')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /back to documents/i }));
      expect(await screen.findByText('BACK')).toBeInTheDocument();
    });

    it('a load failure that is not a 404 offers Try again, which refetches', async () => {
      get.mockRejectedValue(Object.assign(new Error('Internal Server Error'), { status: 500 }));
      renderAt('env-1');
      expect(await screen.findByText("Couldn't load this document")).toBeInTheDocument();
      expect(screen.queryByText('Document not found')).not.toBeInTheDocument();
      const calls = get.mock.calls.length;
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
      await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(calls));
      expect(screen.getByRole('button', { name: /back to documents/i })).toBeInTheDocument();
    });

    it('the back button lands on /documents', async () => {
      mockApi();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Documents' }));
      expect(await screen.findByText('BACK')).toBeInTheDocument();
    });

    it('bounced signer: alert row with Fix email opens the inline fix', async () => {
      mockApi({ signers: [YOU, { ...ALEX, status: 'bounced', email: 'alex@quil.vc' }] });
      renderAt('env-1');
      const user = await ready();
      expect(screen.getByText('Bounced')).toBeInTheDocument();
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Email to Alex bounced');
      await user.click(within(alert).getByRole('button', { name: 'Fix email' }));
      expect(screen.getByRole('textbox', { name: "Alex's email" })).toHaveValue('alex@quil.vc');
    });
  });

  describe('reminders', () => {
    it('Remind all reminds each pending signer once and says how many', async () => {
      mockApi();
      post.mockResolvedValue({ data: {}, status: 202 });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind all' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Reminded 2 signers');
      const urls = post.mock.calls.map((c) => c[0]);
      expect(urls).toEqual([
        '/envelopes/env-1/signers/hannah/remind',
        '/envelopes/env-1/signers/alex/remind',
      ]);
      expect(screen.getAllByRole('button', { name: 'Reminded' })).toHaveLength(2);
    });

    it('all signers throttled: no error, just "Reminded in the last hour"', async () => {
      mockApi();
      post.mockRejectedValue(throttled());
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind all' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Reminded in the last hour');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('partial: one sent, one throttled', async () => {
      mockApi();
      post.mockResolvedValueOnce({ data: {}, status: 202 }).mockRejectedValueOnce(throttled());
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind all' }));
      expect(await screen.findByRole('status')).toHaveTextContent('1 sent · 1 throttled');
    });

    it('partial failure is reported as an error, not lumped in with throttled', async () => {
      mockApi();
      post
        .mockResolvedValueOnce({ data: {}, status: 202 })
        .mockRejectedValueOnce(new Error('boom'));
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind all' }));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('1 sent · 1 failed. Try again for the rest.');
      expect(alert).not.toHaveTextContent('throttled');
    });

    it('every reminder failing for another reason is an error toast', async () => {
      mockApi();
      post.mockRejectedValue(new Error('boom'));
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind all' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/could not send the reminders/i);
    });

    it('a row Remind reminds only that signer and flips to Reminded', async () => {
      mockApi();
      post.mockResolvedValue({ data: {}, status: 202 });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind Hannah Wills' }));
      expect(await screen.findByRole('status')).toHaveTextContent('Reminded Hannah');
      expect(post).toHaveBeenCalledTimes(1);
      expect(screen.getAllByRole('button', { name: 'Reminded' })).toHaveLength(1);
      expect(screen.getByRole('button', { name: 'Remind Alex Reyes' })).toBeEnabled();
    });

    it('a 429 on a row reads as Reminded, not as an error', async () => {
      mockApi();
      post.mockRejectedValue(throttled());
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Remind Alex Reyes' }));
      expect(await screen.findAllByRole('button', { name: 'Reminded' })).toHaveLength(1);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('Auto-remind switch PATCHes reminders_enabled and rolls back with a toast on failure', async () => {
      mockApi();
      patch.mockResolvedValueOnce({ data: {}, status: 200 });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('switch', { name: 'Auto-remind' }));
      expect(patch).toHaveBeenCalledWith('/envelopes/env-1', { reminders_enabled: false }, {});
      await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
      patch.mockRejectedValueOnce(new Error('nope'));
      await user.click(screen.getByRole('switch', { name: 'Auto-remind' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Could not update reminders.');
    });
  });

  describe('signer actions', () => {
    it('the signer menu offers Remind, Fix email and Replace signer', async () => {
      mockApi();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      const menu = await screen.findByRole('menu', { name: 'Signer actions' });
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((m) => m.textContent),
      ).toEqual(['Remind', 'Fix email', 'Replace signer']);
    });

    it('Fix email PATCHes the signer, resends and toasts the new address', async () => {
      mockApi();
      patch.mockResolvedValue({ data: { ...ALEX, email: 'alex@quill.com' }, status: 200 });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Fix email' }));
      const field = screen.getByRole('textbox', { name: "Alex's email" });
      await user.clear(field);
      await user.type(field, 'alex@quill.com');
      await user.click(screen.getByRole('button', { name: 'Resend' }));
      expect(patch).toHaveBeenCalledWith(
        '/envelopes/env-1/signers/alex',
        { email: 'alex@quill.com' },
        {},
      );
      expect(await screen.findByRole('status')).toHaveTextContent('Sent to alex@quill.com');
      expect(screen.queryByRole('textbox', { name: "Alex's email" })).not.toBeInTheDocument();
    });

    it('Fix email checks the address on blur and blocks a malformed one', async () => {
      mockApi();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Fix email' }));
      const field = screen.getByRole('textbox', { name: "Alex's email" });
      await user.clear(field);
      await user.type(field, 'alex@quill');
      // No scolding while typing.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      await user.tab();
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Enter a full email address, like name@company.com.',
      );
      expect(field).toHaveAttribute('aria-invalid', 'true');
      await user.click(screen.getByRole('button', { name: 'Resend' }));
      expect(patch).not.toHaveBeenCalled();
      // Fixing it clears the error live.
      await user.type(field, '.com');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('Fix email Cancel closes the form without a request', async () => {
      mockApi();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Fix email' }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByRole('textbox', { name: "Alex's email" })).not.toBeInTheDocument();
      expect(patch).not.toHaveBeenCalled();
    });

    it('Fix email surfaces a taken address', async () => {
      mockApi();
      patch.mockRejectedValue(new Error('signer_email_taken'));
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Fix email' }));
      await user.click(screen.getByRole('button', { name: 'Resend' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/already on this envelope/i);
    });

    async function openReplace(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
      await user.click(screen.getByRole('button', { name: 'More for Alex Reyes' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Replace signer' }));
      return screen.findByRole('dialog', { name: 'Replace signer' });
    }

    it('Replace signer picks a contact and posts name and email', async () => {
      mockApi({
        contacts: [
          { id: 'c1', name: 'Jordan Lee', email: 'jordan@quill.vc', color: '#4F46E5' },
          { id: 'c2', name: 'Hannah Wills', email: 'hannah@quill.vc', color: '#10B981' },
        ],
      });
      post.mockResolvedValue({ data: { ...ALEX, name: 'Jordan Lee' }, status: 201 });
      renderAt('env-1');
      const user = await ready();
      const dialog = await openReplace(user);
      expect(within(dialog).getByText("Alex's link stops working.")).toBeInTheDocument();
      // Pressing Replace with nothing picked says what is missing instead of doing nothing.
      await user.click(within(dialog).getByRole('button', { name: /replace & send/i }));
      expect(within(dialog).getByRole('alert')).toHaveTextContent('Pick a contact to send to.');
      expect(post).not.toHaveBeenCalled();
      await user.click(await within(dialog).findByRole('radio', { name: /Jordan Lee/ }));
      // A contact already on the envelope is not offered.
      expect(within(dialog).queryByRole('radio', { name: /Hannah Wills/ })).not.toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: /replace & send/i }));
      expect(post).toHaveBeenCalledWith(
        '/envelopes/env-1/signers/alex/replace',
        { name: 'Jordan Lee', email: 'jordan@quill.vc' },
        {},
      );
      expect(await screen.findByRole('status')).toHaveTextContent('Sent to jordan@quill.vc');
      expect(screen.queryByRole('dialog', { name: 'Replace signer' })).not.toBeInTheDocument();
    });

    it('Replace signer with a new email, and Escape closes without a request', async () => {
      mockApi();
      post.mockResolvedValue({ data: ALEX, status: 201 });
      renderAt('env-1');
      const user = await ready();
      let dialog = await openReplace(user);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Replace signer' })).not.toBeInTheDocument();
      dialog = await openReplace(user);
      await user.click(within(dialog).getByRole('radio', { name: 'New email' }));
      await user.type(
        within(dialog).getByRole('textbox', { name: 'New signer email' }),
        'sam@quill.vc',
      );
      await user.click(within(dialog).getByRole('button', { name: /replace & send/i }));
      expect(post).toHaveBeenCalledWith(
        '/envelopes/env-1/signers/alex/replace',
        { name: 'sam', email: 'sam@quill.vc' },
        {},
      );
    });
  });

  describe('withdraw', () => {
    async function openWithdraw(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Withdraw' }));
      return screen.findByRole('alertdialog', { name: 'Withdraw envelope' });
    }

    async function openDeleteDraft(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
      await user.click(screen.getByRole('button', { name: 'More' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Delete draft' }));
      return screen.findByRole('alertdialog', { name: 'Delete draft' });
    }

    it('a sent envelope: confirm calls /cancel and says who is told', async () => {
      mockApi();
      post.mockResolvedValue({
        data: { status: 'canceled', envelope_status: 'canceled' },
        status: 200,
      });
      renderAt('env-1');
      const user = await ready();
      const dialog = await openWithdraw(user);
      expect(within(dialog).getByText('2 signers get a cancel email')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Withdraw envelope' }));
      await waitFor(() =>
        expect(post.mock.calls.some((c) => String(c[0]).endsWith('/envelopes/env-1/cancel'))).toBe(
          true,
        ),
      );
      expect(await screen.findByRole('status')).toHaveTextContent(/withdrawn/i);
    });

    it('Keep and Escape close the dialog without cancelling', async () => {
      mockApi();
      renderAt('env-1');
      const user = await ready();
      let dialog = await openWithdraw(user);
      // The safe choice holds focus, so Enter never withdraws by accident.
      expect(within(dialog).getByRole('button', { name: 'Keep envelope' })).toHaveFocus();
      await user.click(within(dialog).getByRole('button', { name: 'Keep envelope' }));
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      dialog = await openWithdraw(user);
      await user.click(dialog.parentElement as HTMLElement);
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await openWithdraw(user);
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      expect(post).not.toHaveBeenCalled();
    });

    it('a failing cancel is an error toast', async () => {
      mockApi();
      post.mockRejectedValue(new Error('server down'));
      renderAt('env-1');
      const user = await ready();
      const dialog = await openWithdraw(user);
      await user.click(within(dialog).getByRole('button', { name: 'Withdraw envelope' }));
      // Raw server text never reaches the user; the toast says what to do next.
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Could not withdraw this envelope. Refresh the page and try again.',
      );
      expect(alert).not.toHaveTextContent('server down');
    });

    it('a draft is deleted, not cancelled, and returns to the list', async () => {
      mockApi({ status: 'draft' });
      del.mockResolvedValue({ data: undefined, status: 204 });
      renderAt('env-1');
      const user = await ready();
      const dialog = await openDeleteDraft(user);
      await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
      expect(await screen.findByText('BACK')).toBeInTheDocument();
      expect(del).toHaveBeenCalledWith('/envelopes/env-1', {});
      expect(post).not.toHaveBeenCalled();
    });

    it('a failing draft delete keeps the page and toasts', async () => {
      mockApi({ status: 'draft' });
      del.mockRejectedValue(new Error('cannot delete'));
      renderAt('env-1');
      const user = await ready();
      const dialog = await openDeleteDraft(user);
      await user.click(within(dialog).getByRole('button', { name: 'Delete draft' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not delete this draft. Refresh the page and try again.',
      );
    });
  });

  describe('download', () => {
    function stubWindow(): ReturnType<typeof vi.spyOn> {
      const w = { close: vi.fn(), closed: false, opener: {}, location: { href: 'about:blank' } };
      return vi.spyOn(window, 'open').mockReturnValue(w as unknown as Window);
    }

    it('before sealing: the main button downloads the original; sealed items are locked', async () => {
      mockApi();
      stubWindow();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Download options' }));
      const menu = await screen.findByRole('menu', { name: 'Download' });
      expect(within(menu).getByRole('menuitem', { name: /Sealed PDF/ })).toBeDisabled();
      expect(within(menu).getByRole('menuitem', { name: /Audit trail/ })).toBeDisabled();
      expect(within(menu).getAllByText('After all sign').length).toBeGreaterThan(0);
      expect(within(menu).getByRole('menuitem', { name: 'Original PDF' })).toBeEnabled();
      await user.click(within(menu).getByRole('menuitem', { name: 'Original PDF' }));
      expect(await screen.findByRole('status')).toHaveTextContent(/Original PDF opened/i);
      expect(get).toHaveBeenCalledWith(
        '/envelopes/env-1/download',
        expect.objectContaining({ params: expect.objectContaining({ kind: 'original' }) }),
      );
    });

    it('sealed: the main button opens only the sealed PDF, never the audit trail', async () => {
      mockApi({ status: 'completed', signers: [YOU] });
      stubWindow();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Download' }));
      expect(await screen.findByRole('status')).toHaveTextContent(/Sealed PDF opened/i);
      const kinds = get.mock.calls
        .filter((c) => c[0] === '/envelopes/env-1/download')
        .map((c) => (c[1] as { params: { kind: string } }).params.kind);
      expect(kinds).toEqual(['sealed']);
    });

    it('sealed: Audit trail from the menu opens the audit artifact', async () => {
      mockApi({ status: 'completed', signers: [YOU] });
      stubWindow();
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Download options' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Audit trail' }));
      expect(await screen.findByRole('status')).toHaveTextContent(/Audit trail opened/i);
      expect(get).toHaveBeenCalledWith(
        '/envelopes/env-1/download',
        expect.objectContaining({ params: expect.objectContaining({ kind: 'audit' }) }),
      );
    });

    it('popup blocked: falls back to an anchor click and says to allow popups', async () => {
      mockApi({ status: 'completed', signers: [YOU] });
      vi.spyOn(window, 'open').mockReturnValue(null);
      const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Download options' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Sealed PDF' }));
      expect(await screen.findByRole('status')).toHaveTextContent(/allow popups/i);
      expect(click).toHaveBeenCalledTimes(1);
    });

    it('a file that is not ready is explained, not shown raw', async () => {
      mockApi({ status: 'completed', signers: [YOU] });
      const w = { close: vi.fn(), closed: false, opener: {}, location: { href: '' } };
      vi.spyOn(window, 'open').mockReturnValue(w as unknown as Window);
      renderAt('env-1');
      const user = await ready();
      get.mockImplementation((url: string) =>
        url.endsWith('/download')
          ? Promise.reject(new Error('file_not_ready'))
          : Promise.resolve({ data: { events: [] }, status: 200 }),
      );
      await user.click(screen.getByRole('button', { name: 'Download options' }));
      await user.click(await screen.findByRole('menuitem', { name: 'Sealed PDF' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/has not been produced/i);
      expect(w.close).toHaveBeenCalled();
    });
  });

  describe('Save to Drive', () => {
    async function openMenu(): Promise<ReturnType<typeof userEvent.setup>> {
      mockApi({ status: 'completed', signers: [YOU] });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: 'Download options' }));
      return user;
    }

    it('calls save() with the envelope', async () => {
      saveMock.mockResolvedValue({ kind: 'canceled' });
      const user = await openMenu();
      await user.click(await screen.findByRole('menuitem', { name: /save to drive/i }));
      expect(saveMock).toHaveBeenCalledTimes(1);
      expect((saveMock.mock.calls[0]![0] as { id: string }).id).toBe('env-1');
    });

    it.each([
      [{ kind: 'saved', result: {} }, 'status', /saved to google drive/i],
      [{ kind: 'connect-needed' }, 'alert', /connect a google drive account/i],
      [{ kind: 'rate-limited', retryAfterSeconds: 17 }, 'alert', /try again in 17s/i],
      [{ kind: 'partial', result: {} }, 'alert', /audit trail upload failed/i],
      [{ kind: 'reconnect-needed' }, 'alert', /connection expired/i],
      [{ kind: 'permission-denied' }, 'alert', /couldn't write to that folder/i],
      [{ kind: 'picker-not-configured' }, 'alert', /picker is not configured/i],
      [{ kind: 'not-sealed' }, 'alert', /isn't sealed yet/i],
      [{ kind: 'error', message: 'bad' }, 'alert', /bad/i],
    ])('maps the outcome %o to a toast', async (outcome, role, text) => {
      saveMock.mockResolvedValue(outcome);
      const user = await openMenu();
      await user.click(await screen.findByRole('menuitem', { name: /save to drive/i }));
      expect(await screen.findByRole(role)).toHaveTextContent(text);
    });
  });

  describe('activity', () => {
    const events = [
      {
        id: 'e1',
        envelope_id: 'env-1',
        signer_id: null,
        actor_kind: 'sender',
        event_type: 'created',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(5 * 24 * HOUR),
      },
      {
        id: 'e2',
        envelope_id: 'env-1',
        signer_id: null,
        actor_kind: 'sender',
        event_type: 'sent',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(4 * 24 * HOUR),
      },
      {
        id: 'e3',
        envelope_id: 'env-1',
        signer_id: 'you',
        actor_kind: 'signer',
        event_type: 'signed',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(3 * 24 * HOUR),
      },
      {
        id: 'e4',
        envelope_id: 'env-1',
        signer_id: 'alex',
        actor_kind: 'system',
        event_type: 'reminder_sent',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(48 * HOUR),
      },
      {
        id: 'e5',
        envelope_id: 'env-1',
        signer_id: 'hannah',
        actor_kind: 'signer',
        event_type: 'viewed',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(2 * HOUR),
      },
      {
        id: 'e6',
        envelope_id: 'env-1',
        signer_id: 'hannah',
        actor_kind: 'signer',
        event_type: 'tc_accepted',
        ip: null,
        user_agent: null,
        metadata: {},
        created_at: ago(HOUR),
      },
    ];

    it('shows the newest three, then all with Show all / Show less; hides quiet events', async () => {
      mockApi({ events });
      renderAt('env-1');
      const user = await ready();
      const card = await screen.findByRole('region', { name: 'Activity' });
      expect(await within(card).findByText('Hannah opened')).toBeInTheDocument();
      expect(within(card).getByText('Auto-reminder to Alex')).toBeInTheDocument();
      expect(within(card).getByText('Eliran signed')).toBeInTheDocument();
      expect(within(card).queryByText('Created')).not.toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: 'Show all (5)' }));
      expect(within(card).getByText('Created')).toBeInTheDocument();
      expect(within(card).getByText('Sent to 3 signers')).toBeInTheDocument();
      await user.click(within(card).getByRole('button', { name: 'Show less' }));
      expect(within(card).queryByText('Created')).not.toBeInTheDocument();
    });

    it('shows Chain intact from the server verdict, and Chain broken when false', async () => {
      mockApi({ events, chain_intact: true });
      const first = renderAt('env-1');
      expect(await screen.findByText('Chain intact')).toBeInTheDocument();
      first.unmount();
      mockApi({ events, chain_intact: false });
      renderAt('env-1');
      expect(await screen.findByText('Chain broken')).toBeInTheDocument();
    });

    it('words the fix and replace events', async () => {
      mockApi({
        events: [
          {
            id: 'f1',
            envelope_id: 'env-1',
            signer_id: 'alex',
            actor_kind: 'sender',
            event_type: 'signer_corrected',
            ip: null,
            user_agent: null,
            metadata: { new_email: 'alex@quill.com' },
            created_at: ago(HOUR),
          },
          {
            id: 'f2',
            envelope_id: 'env-1',
            signer_id: 'alex',
            actor_kind: 'sender',
            event_type: 'signer_replaced',
            ip: null,
            user_agent: null,
            metadata: { previous_name: 'Alex Reyes', new_name: 'Jordan Lee' },
            created_at: ago(2 * HOUR),
          },
        ],
      });
      renderAt('env-1');
      expect(await screen.findByText("Fixed Alex's email to alex@quill.com")).toBeInTheDocument();
      expect(screen.getByText('Replaced Alex Reyes with Jordan Lee')).toBeInTheDocument();
    });
  });

  describe('tags', () => {
    it('adding a tag PATCHes the full next array', async () => {
      mockApi();
      patch.mockResolvedValue({ data: {}, status: 200 });
      renderAt('env-1');
      const user = await ready();
      await user.click(screen.getByRole('button', { name: /add tag/i }));
      await user.type(await screen.findByLabelText(/add tag/i), 'q4{Enter}');
      await waitFor(() =>
        expect(patch).toHaveBeenCalledWith('/envelopes/env-1', { tags: ['Legal', 'q4'] }, {}),
      );
    });
  });
});
