import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithTheme } from '@/test/renderWithTheme';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/verifyApiClient', () => ({
  verifyApiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));
vi.mock('@/lib/api/apiClient', () => ({ apiClient: {} }));

import { DirectLinkPage } from './DirectLinkPage';

const TOKEN = `dl_${'a'.repeat(43)}`;

function renderPage(path = `/d/${TOKEN}`) {
  return renderWithTheme(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/d/:token" element={<DirectLinkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function httpError(status: number): Error {
  return Object.assign(new Error('x'), { status });
}

describe('DirectLinkPage', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    getMock.mockResolvedValue({
      data: { template_title: 'Consulting agreement', sender_name: 'Olive Owner' },
    });
  });

  it('shows only the template title and sender name, with an empty form', async () => {
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'Consulting agreement' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Olive Owner asks you to sign this document/)).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith(`/direct-links/${TOKEN}`);
    expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /Your email/ })).toHaveValue('');
  });

  it('takes no prefill from the URL', async () => {
    renderPage(`/d/${TOKEN}?name=Eve&email=eve@example.org`);
    expect(await screen.findByRole('textbox', { name: /Your email/ })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /Your name/ })).toHaveValue('');
  });

  it('sends the name and email, then asks the visitor to check their inbox', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { status: 'check_your_email' } });
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), ' Ada Lovelace ');
    await user.type(screen.getByRole('textbox', { name: /Your email/ }), 'ada@example.org');
    await user.click(screen.getByRole('button', { name: 'Email me the signing link' }));
    expect(postMock).toHaveBeenCalledWith(`/direct-links/${TOKEN}/claim`, {
      name: 'Ada Lovelace',
      email: 'ada@example.org',
    });
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/ada@example.org/)).toBeInTheDocument();
  });

  it('validates before sending', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Email me the signing link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your name.');
    await user.type(screen.getByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: /Your email/ }), 'nope');
    await user.click(screen.getByRole('button', { name: 'Email me the signing link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email address.');
    expect(postMock).not.toHaveBeenCalled();
  });

  it('shows the same unavailable page for a missing, off or replaced link', async () => {
    getMock.mockRejectedValue(httpError(404));
    renderPage();
    expect(
      await screen.findByRole('heading', { name: 'This link is not available' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('switches to the unavailable page when the link is turned off mid-form', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(httpError(404));
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: /Your email/ }), 'ada@example.org');
    await user.click(screen.getByRole('button', { name: 'Email me the signing link' }));
    expect(
      await screen.findByRole('heading', { name: 'This link is not available' }),
    ).toBeInTheDocument();
  });

  it('keeps the form and explains a rate limit', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(httpError(429));
    renderPage();
    await user.type(await screen.findByRole('textbox', { name: /Your name/ }), 'Ada');
    await user.type(screen.getByRole('textbox', { name: /Your email/ }), 'ada@example.org');
    await user.click(screen.getByRole('button', { name: 'Email me the signing link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests');
    expect(screen.getByRole('textbox', { name: /Your email/ })).toHaveValue('ada@example.org');
  });

  it('keeps the token URL out of referrers while the page is open', async () => {
    const { unmount } = renderPage();
    await screen.findByRole('heading', { name: 'Consulting agreement' });
    expect(document.head.querySelector('meta[name="referrer"]')?.getAttribute('content')).toBe(
      'no-referrer',
    );
    unmount();
    await waitFor(() => expect(document.head.querySelector('meta[name="referrer"]')).toBeNull());
  });
});
