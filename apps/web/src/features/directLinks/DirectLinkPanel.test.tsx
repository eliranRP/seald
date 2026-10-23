import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
vi.mock('@/lib/api/verifyApiClient', () => ({ verifyApiClient: {} }));

import { DirectLinkPanel, directLinkErrorMessage } from './DirectLinkPanel';
import { FAKE_TOKEN, fakeLink, fakeTemplate } from './fixtures';

const URL_PATH = `/templates/${fakeTemplate.id}/direct-link`;

function linkIs(link: ReturnType<typeof fakeLink> | null): void {
  getMock.mockResolvedValue({ data: { link } });
}

function httpError(message: string): Error {
  return Object.assign(new Error(message), { status: 422 });
}

describe('DirectLinkPanel', () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    patchMock.mockReset();
    deleteMock.mockReset();
  });

  it('creates a link bound to the chosen signer and shows the full URL once', async () => {
    const user = userEvent.setup();
    linkIs(null);
    postMock.mockResolvedValue({
      data: { link: fakeLink(), token: FAKE_TOKEN, path: `/d/${FAKE_TOKEN}` },
    });
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);

    await user.selectOptions(
      await screen.findByLabelText('Person who opens the link signs as'),
      'slot-guest',
    );
    await user.type(screen.getByLabelText('Name shown on the public page'), 'Olive');
    await user.click(screen.getByRole('button', { name: 'Create direct link' }));

    expect(postMock).toHaveBeenCalledWith(URL_PATH, {
      signer_slot: 'slot-guest',
      daily_cap: 50,
      sender_name: 'Olive',
    });
    const dialog = await screen.findByRole('dialog', { name: 'Your direct link' });
    expect(within(dialog).getByLabelText('Secret value')).toHaveTextContent(
      `${window.location.origin}/d/${FAKE_TOKEN}`,
    );
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(FAKE_TOKEN, { exact: false })).not.toBeInTheDocument();
  });

  it('explains what is missing instead of offering a link that cannot work', async () => {
    linkIs(null);
    renderWithProviders(<DirectLinkPanel template={{ ...fakeTemplate, hasExamplePdf: false }} />);
    expect(
      await screen.findByText('Save an example PDF with this template to turn on a direct link.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create direct link' })).toBeDisabled();
  });

  it('shows the API reason when creating fails', async () => {
    const user = userEvent.setup();
    linkIs(null);
    postMock.mockRejectedValue(httpError('signer_without_signature_field'));
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    await user.click(await screen.findByRole('button', { name: 'Create direct link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Every signer on the template needs a signature or initials field.',
    );
  });

  it('rejects a daily limit outside 1 to 1000', async () => {
    const user = userEvent.setup();
    linkIs(null);
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    const cap = await screen.findByLabelText('New requests allowed per day');
    await user.clear(cap);
    await user.type(cap, '5000');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a number from 1 to 1000.');
    expect(screen.getByRole('button', { name: 'Create direct link' })).toBeDisabled();
  });

  it('shows an existing link by its fingerprint, never as a full URL', async () => {
    linkIs(fakeLink());
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    const status = await screen.findByLabelText('Direct link status');
    expect(within(status).getByText('dl_xxxxxx…')).toBeInTheDocument();
    expect(within(status).getByText('On')).toBeInTheDocument();
    expect(within(status).getByText(/3 of 50 new requests/)).toBeInTheDocument();
    expect(screen.queryByText(/\/d\/dl_/)).not.toBeInTheDocument();
  });

  it('turns the link off and on without rotating it', async () => {
    const user = userEvent.setup();
    linkIs(fakeLink());
    patchMock.mockResolvedValue({ data: fakeLink({ enabled: false }) });
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    await user.click(await screen.findByRole('checkbox', { name: /Accept new signers/ }));
    expect(patchMock).toHaveBeenCalledWith(URL_PATH, { enabled: false });
    expect(postMock).not.toHaveBeenCalled();
  });

  it('saves the signer, name and daily limit', async () => {
    const user = userEvent.setup();
    linkIs(fakeLink());
    patchMock.mockResolvedValue({ data: fakeLink({ daily_cap: 20 }) });
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    const cap = await screen.findByLabelText('New requests allowed per day');
    await user.clear(cap);
    await user.type(cap, '20');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(patchMock).toHaveBeenCalledWith(URL_PATH, {
      signer_slot: 'slot-guest',
      daily_cap: 20,
      sender_name: 'Olive',
    });
  });

  it('rotates only after confirming, then shows the new URL once', async () => {
    const user = userEvent.setup();
    linkIs(fakeLink());
    postMock.mockResolvedValue({
      data: {
        link: fakeLink({ prefix: 'dl_yyyyyy' }),
        token: FAKE_TOKEN,
        path: `/d/${FAKE_TOKEN}`,
      },
    });
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    await user.click(await screen.findByRole('button', { name: 'Rotate link' }));
    expect(postMock).not.toHaveBeenCalled();
    const confirm = screen.getByRole('group', { name: 'Confirm rotate' });
    expect(within(confirm).getByText(/stops the old one right away/)).toBeInTheDocument();
    await user.click(within(confirm).getByRole('button', { name: 'Rotate now' }));
    expect(postMock).toHaveBeenCalledWith(`${URL_PATH}/rotate`);
    expect(await screen.findByRole('dialog', { name: 'Your direct link' })).toBeInTheDocument();
  });

  it('removes the link only after confirming', async () => {
    const user = userEvent.setup();
    linkIs(fakeLink());
    deleteMock.mockResolvedValue({});
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    await user.click(await screen.findByRole('button', { name: 'Remove link' }));
    expect(deleteMock).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('group', { name: 'Confirm remove' })).getByRole('button', {
        name: 'Remove now',
      }),
    );
    expect(deleteMock).toHaveBeenCalledWith(URL_PATH);
  });

  it('says so when direct links are not available', async () => {
    getMock.mockRejectedValue(Object.assign(new Error('not_found'), { status: 404 }));
    renderWithProviders(<DirectLinkPanel template={fakeTemplate} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Direct links are not available right now.',
    );
  });
});

describe('directLinkErrorMessage', () => {
  it('maps known slugs and falls back to a generic line', () => {
    expect(directLinkErrorMessage(new Error('template_needs_example_pdf'))).toBe(
      'Save an example PDF with this template first.',
    );
    expect(directLinkErrorMessage(new Error('boom'))).toBe('Something went wrong. Try again.');
    expect(directLinkErrorMessage('x')).toBe('Something went wrong. Try again.');
  });
});
