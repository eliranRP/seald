import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import * as shared from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

import { FAKE_SECRET, fakeAutomation, fakeDriveAutomation } from './fixtures';
import { NewAutomationPanel } from './NewAutomationPanel';

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderNew(recipe: string | null) {
  const search = recipe ? `?recipe=${recipe}` : '';
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/settings/automations/new${search}`]}>
      <Routes>
        <Route
          path="/settings/automations/new"
          element={<NewAutomationPanel basePath="/settings/automations" />}
        />
        <Route path="*" element={<p>elsewhere</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function httpError(status: number, code: string): Error {
  return Object.assign(new Error('failed'), { status, code });
}

describe('NewAutomationPanel', () => {
  beforeEach(() => {
    postMock.mockReset();
    vi.spyOn(shared, 'isFeatureEnabled').mockReturnValue(true);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a webhook asks for the address, saves it on, and shows the secret once with Copy only', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { automation: fakeAutomation(), secret: FAKE_SECRET } });
    const { container } = renderNew('sealed_webhook');

    const save = await screen.findByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(await axe(container)).toHaveNoViolations();
    await user.type(
      screen.getByRole('textbox', { name: 'Webhook address' }),
      ' https://hooks.example.com/a ',
    );
    await user.click(save);

    expect(postMock).toHaveBeenCalledWith('/automations', {
      recipe: 'sealed_webhook',
      url: 'https://hooks.example.com/a',
    });
    const dialog = await screen.findByRole('dialog', { name: 'Your signing secret' });
    expect(within(dialog).getByLabelText('Secret value')).toHaveTextContent(FAKE_SECRET);
    expect(within(dialog).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.getByTestId('where')).toHaveTextContent(
      '/settings/automations/00000000-0000-4000-8000-0000000000a1',
    );
    expect(screen.queryByText(FAKE_SECRET, { exact: false })).not.toBeInTheDocument();
  });

  it('signer details are an explicit choice behind Advanced', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { automation: fakeAutomation(), secret: FAKE_SECRET } });
    renderNew('sealed_webhook');

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Advanced options' }));
    const box = screen.getByRole('checkbox', { name: "Include the signer's name and email" });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/These details leave Seald/)).toBeInTheDocument();
    await user.click(box);
    await user.type(
      screen.getByRole('textbox', { name: 'Webhook address' }),
      'https://hooks.example.com/a',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(postMock).toHaveBeenCalledWith('/automations', {
      recipe: 'sealed_webhook',
      url: 'https://hooks.example.com/a',
      payload_detail: 'with_signer',
    });
  });

  it('says why a private address was refused', async () => {
    const user = userEvent.setup();
    postMock.mockRejectedValue(httpError(400, 'webhook_url_blocked'));
    renderNew('sealed_webhook');

    await user.type(
      await screen.findByRole('textbox', { name: 'Webhook address' }),
      'https://10.0.0.1/x',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Seald can't send to that address. Use a public https address.",
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Drive names My Drive / Seald, asks for nothing, and turns on', async () => {
    const user = userEvent.setup();
    postMock.mockResolvedValue({ data: { automation: fakeDriveAutomation() } });
    renderNew('sealed_save_drive');

    expect(await screen.findByText(/Saved to My Drive \/ Seald/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(postMock).toHaveBeenCalledWith('/automations', { recipe: 'sealed_save_drive' });
    expect(await screen.findByText('elsewhere')).toBeInTheDocument();
  });

  it('email goes to the account address with no field to fill', async () => {
    renderNew('declined_notify_me');
    expect(await screen.findByText(/email address on your account/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('Cancel goes back to the list', async () => {
    const user = userEvent.setup();
    renderNew('sealed_webhook');
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('elsewhere')).toBeInTheDocument();
  });

  it('asks for a recipe first when none is named', async () => {
    renderNew(null);
    expect(await screen.findByRole('status')).toHaveTextContent('Pick an automation first.');
    expect(screen.getByRole('link', { name: 'Back to automations' })).toHaveAttribute(
      'href',
      '/settings/automations',
    );
  });
});
