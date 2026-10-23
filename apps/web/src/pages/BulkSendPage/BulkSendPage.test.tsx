import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import * as sharedModule from 'shared';
import { renderWithProviders } from '@/test/renderWithProviders';

const requestMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    request: (...args: unknown[]): unknown => requestMock(...args),
  },
}));

import { BATCH_ID, TEMPLATE_ID, fakeBatch, fakeSchema } from '@/features/bulkSend/fixtures';
import { BulkSendPage } from './BulkSendPage';

function Probe() {
  const location = useLocation();
  return <div data-testid="probe">{location.pathname}</div>;
}

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates" element={<h1>templates stub</h1>} />
        <Route path="/templates/:id/bulk-send/:batchId?" element={<BulkSendPage />} />
      </Routes>
      <Probe />
    </MemoryRouter>,
  );
}

function serve(): void {
  requestMock.mockImplementation((call: { method: string; url: string }) => {
    const key = `${call.method.toUpperCase()} ${call.url}`;
    if (key === `GET /templates/${TEMPLATE_ID}/bulk-schema`) {
      return Promise.resolve({ status: 200, data: fakeSchema() });
    }
    if (key === `POST /templates/${TEMPLATE_ID}/bulk-batches`) {
      return Promise.resolve({ status: 201, data: fakeBatch() });
    }
    if (key === `GET /bulk-batches/${BATCH_ID}`) {
      return Promise.resolve({ status: 200, data: fakeBatch() });
    }
    return Promise.resolve({ status: 404, data: { error: 'not_found' } });
  });
}

describe('BulkSendPage', () => {
  beforeEach(() => {
    requestMock.mockReset();
    serve();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('says it is not available, and calls nothing, while the flag is off', () => {
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockReturnValue(false);
    renderAt(`/templates/${TEMPLATE_ID}/bulk-send`);
    expect(screen.getByRole('heading', { level: 1, name: 'Bulk send' })).toBeVisible();
    expect(screen.getByText("Bulk send isn't available yet.")).toBeVisible();
    expect(requestMock).not.toHaveBeenCalled();
  });

  it('starts at the upload step and puts the new batch in the URL after the preview', async () => {
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockImplementation((flag) => flag === 'bulkSend');
    const user = userEvent.setup();
    renderAt(`/templates/${TEMPLATE_ID}/bulk-send`);

    await user.upload(
      await screen.findByLabelText('CSV file'),
      new File(['a,b\n'], 'x.csv', { type: 'text/csv' }),
    );
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByRole('heading', { name: 'Check before sending' })).toBeVisible();
    expect(screen.getByTestId('probe')).toHaveTextContent(
      `/templates/${TEMPLATE_ID}/bulk-send/${BATCH_ID}`,
    );
  });

  it('opens straight onto a batch from its link, and "Choose a different file" goes back', async () => {
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockImplementation((flag) => flag === 'bulkSend');
    const user = userEvent.setup();
    renderAt(`/templates/${TEMPLATE_ID}/bulk-send/${BATCH_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Choose a different file' }));

    expect(await screen.findByRole('heading', { name: 'Upload your recipients' })).toBeVisible();
    expect(screen.getByTestId('probe')).toHaveTextContent(`/templates/${TEMPLATE_ID}/bulk-send`);
    expect(screen.getByTestId('probe')).not.toHaveTextContent(BATCH_ID);
  });

  it('links back to the templates list', async () => {
    vi.spyOn(sharedModule, 'isFeatureEnabled').mockReturnValue(false);
    const user = userEvent.setup();
    renderAt(`/templates/${TEMPLATE_ID}/bulk-send`);
    await user.click(screen.getByRole('link', { name: 'Templates' }));
    expect(screen.getByRole('heading', { name: 'templates stub' })).toBeVisible();
  });
});
