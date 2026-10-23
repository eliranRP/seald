import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/renderWithProviders';
import { fakeEnvelope, ENVELOPE_ID } from '@/features/approvals/fixtures';

const getMock = vi.fn();
const postMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
    post: (...args: unknown[]): unknown => postMock(...args),
  },
}));

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

import { ReviewPlacement } from './ReviewPlacement';

interface OverrideHost {
  __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean>;
}
const host = globalThis as OverrideHost;

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}</p>;
}

function renderPlacement(props: Parameters<typeof ReviewPlacement>[0]) {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/document/start']}>
      <Routes>
        <Route path="*" element={<ReviewPlacement {...props} />} />
      </Routes>
      <Where />
    </MemoryRouter>,
  );
}

function mobile(matches: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

describe('ReviewPlacement', () => {
  beforeEach(() => {
    host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: true };
    getMock.mockReset();
    postMock.mockReset();
    // No PDF url: the canvas shows its placeholder and the fields still sit on it.
    getMock.mockResolvedValue({ data: { url: '', kind: 'original' } });
    mobile(false);
  });

  afterEach(() => {
    delete host.__SEALD_FEATURE_OVERRIDES__;
  });

  it('is one button on a draft that has a file, signers and fields', () => {
    renderPlacement({ envelope: fakeEnvelope() });
    expect(screen.getByRole('button', { name: 'Review placement' })).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['the MCP server is off', () => (host.__SEALD_FEATURE_OVERRIDES__ = { mcpServer: false }), {}],
    ['the envelope is already out', () => undefined, { status: 'awaiting_others' as const }],
    ['there are no fields', () => undefined, { fields: [] }],
    ['there are no signers', () => undefined, { signers: [] }],
    ['no file was uploaded', () => undefined, { original_pages: null }],
  ])('is absent when %s', (_why, setup, overrides) => {
    setup();
    const { container } = renderPlacement({ envelope: fakeEnvelope(overrides) });
    expect(container.querySelector('button')).toBeNull();
  });

  it('opens the guided review over the app, named, with Send and Edit', async () => {
    const user = userEvent.setup();
    renderPlacement({ envelope: fakeEnvelope() });

    await user.click(screen.getByRole('button', { name: 'Review placement' }));

    const dialog = screen.getByRole('dialog', { name: 'Review placement' });
    expect(
      within(dialog).getByText(/Send for signature · Services agreement · Page 1 \/ 3/),
    ).toBeVisible();
    const bar = within(dialog).getByRole('group', { name: 'Review actions' });
    expect(within(bar).getByRole('button', { name: 'Send' })).toBeVisible();
    expect(within(bar).getByRole('button', { name: 'Edit' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Close the review' })).toBeVisible();
    // Opening it sends nothing.
    expect(postMock).not.toHaveBeenCalled();
  });

  it('Send posts the draft to the send route once, closes, and says it went out', async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    postMock.mockResolvedValue({ data: { ...fakeEnvelope(), status: 'awaiting_others' } });
    renderPlacement({ envelope: fakeEnvelope(), onSent });

    await user.click(screen.getByRole('button', { name: 'Review placement' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await vi.waitFor(() => {
      expect(onSent).toHaveBeenCalledTimes(1);
    });
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(String(postMock.mock.calls[0]?.[0])).toBe(`/envelopes/${ENVELOPE_ID}/send`);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([
    ['signer_without_signature_field', /Every signer needs a signature field/],
    ['no_fields', /isn't ready to send yet/],
    ['something_else', /That did not go through/],
  ])('a refused send (%s) stays in the review with a reason', async (code, reason) => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    postMock.mockRejectedValue(Object.assign(new Error('refused'), { code, status: 409 }));
    renderPlacement({ envelope: fakeEnvelope(), onSent });

    await user.click(screen.getByRole('button', { name: 'Review placement' }));
    await user.click(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    expect(screen.getByRole('dialog', { name: 'Review placement' })).toBeVisible();
    expect(onSent).not.toHaveBeenCalled();
  });

  it('Edit closes the review and opens the field editor', async () => {
    const user = userEvent.setup();
    renderPlacement({ envelope: fakeEnvelope() });

    await user.click(screen.getByRole('button', { name: 'Review placement' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent(`/document/${ENVELOPE_ID}`);
    expect(postMock).not.toHaveBeenCalled();
  });

  it('Close and Escape leave without sending, and focus returns to the button', async () => {
    const user = userEvent.setup();
    renderPlacement({ envelope: fakeEnvelope() });
    const open = screen.getByRole('button', { name: 'Review placement' });

    await user.click(open);
    await user.click(screen.getByRole('button', { name: 'Close the review' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();

    await user.click(open);
    expect(screen.getByRole('dialog', { name: 'Review placement' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(open).toHaveFocus();
    expect(postMock).not.toHaveBeenCalled();
  });

  it('does not take focus on first render', () => {
    renderPlacement({ envelope: fakeEnvelope() });
    expect(screen.getByRole('button', { name: 'Review placement' })).not.toHaveFocus();
  });

  it('on a phone there is no Edit (the editor does not open there)', async () => {
    mobile(true);
    const user = userEvent.setup();
    renderPlacement({ envelope: fakeEnvelope() });

    await user.click(screen.getByRole('button', { name: 'Review placement' }));
    const dialog = screen.getByRole('dialog', { name: 'Review placement' });
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Send' }).length).toBeGreaterThan(0);
  });

  it('has no accessibility violations, closed or open', async () => {
    const user = userEvent.setup();
    const { container } = renderPlacement({ envelope: fakeEnvelope() });
    expect(await axe(container)).toHaveNoViolations();

    await user.click(screen.getByRole('button', { name: 'Review placement' }));
    expect(await axe(screen.getByRole('dialog'))).toHaveNoViolations();
  });
});
