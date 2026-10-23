import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithProviders } from '@/test/renderWithProviders';
import { fakeEnvelope } from '../fixtures';

const getMock = vi.fn();

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: (...args: unknown[]): unknown => getMock(...args),
  },
}));

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

import { ApprovalReview, type ApprovalReviewProps } from './ApprovalReview';

function renderReview(overrides: Partial<ApprovalReviewProps> = {}) {
  const props: ApprovalReviewProps = {
    envelope: fakeEnvelope(),
    actionLabel: 'Send for signature',
    step: 1,
    onStepChange: vi.fn(),
    onApprove: vi.fn(),
    onEdit: vi.fn(),
    onExit: vi.fn(),
    busy: false,
    isMobile: false,
    ...overrides,
  };
  return { props, ...renderWithProviders(<ApprovalReview {...props} />) };
}

describe('ApprovalReview', () => {
  beforeEach(() => {
    getMock.mockReset();
    // No PDF url: the canvas shows its placeholder and the fields still sit on it.
    getMock.mockResolvedValue({ data: { url: '', kind: 'original' } });
  });

  it('shows the first page with its fields in signer colours and a legend', () => {
    renderReview();

    expect(
      screen.getByText('Send for signature · Services agreement · Page 1 / 3'),
    ).toBeInTheDocument();
    const page = screen.getByRole('region', { name: 'Page 1 of 3' });
    expect(
      within(page).getByRole('group', { name: 'Signature field for Ada Lovelace' }),
    ).toBeInTheDocument();
    expect(
      within(page).getByRole('group', { name: 'Date field for Grace Hopper' }),
    ).toBeInTheDocument();
    expect(within(page).queryByRole('group', { name: /Initials/ })).not.toBeInTheDocument();

    const legend = screen.getByRole('list', { name: 'Signer legend' });
    expect(within(legend).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(legend).getAllByText('2 fields')).toHaveLength(2);
  });

  it('has Approve and Edit in the sticky bar on every page, the first included', () => {
    for (const step of [1, 2, 3]) {
      const { unmount } = renderReview({ step });
      const bar = screen.getByRole('group', { name: 'Review actions' });
      expect(within(bar).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
      expect(within(bar).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      unmount();
    }
  });

  it('names the primary button and the back button when the caller says so (the app send flow)', () => {
    renderReview({ approveLabel: 'Send', backLabel: 'Close the review' });
    const bar = screen.getByRole('group', { name: 'Review actions' });
    expect(within(bar).getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(within(bar).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close the review' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back to the approval' })).not.toBeInTheDocument();
  });

  it('Approve and Edit call their handlers; Approve never fires on its own', async () => {
    const user = userEvent.setup();
    const { props } = renderReview();
    expect(props.onApprove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    await user.click(screen.getByRole('button', { name: 'Edit' }));

    expect(props.onApprove).toHaveBeenCalledTimes(1);
    expect(props.onEdit).toHaveBeenCalledTimes(1);
  });

  it('steps with Back and Next in the bar, one page at a time across documents', async () => {
    const user = userEvent.setup();
    const { props } = renderReview({ step: 2 });

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(props.onStepChange).toHaveBeenLastCalledWith(3);
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onStepChange).toHaveBeenLastCalledWith(1);
  });

  it('disables Back on the first page', () => {
    renderReview({ step: 1 });
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
  });

  it('shows the second document by its title on its own page', () => {
    renderReview({ step: 3 });
    expect(screen.getByText('Send for signature · Schedule A · Page 3 / 3')).toBeInTheDocument();
    const page = screen.getByRole('region', { name: 'Page 3 of 3' });
    expect(
      within(page).getByRole('group', { name: 'Signature field for Grace Hopper' }),
    ).toBeInTheDocument();
  });

  it('ends on "All fields checked" with each signer, count and pages, then Approve or Edit', async () => {
    const user = userEvent.setup();
    const { props } = renderReview({ step: 4 });

    const summary = screen.getByRole('region', { name: 'All fields checked' });
    const rows = within(summary).getByRole('list', { name: 'Fields by signer' });
    expect(within(rows).getByText('Ada Lovelace')).toBeInTheDocument();
    expect(within(rows).getByText('2 fields on pages 1, 2')).toBeInTheDocument();
    expect(within(rows).getByText('2 fields on pages 1, 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Approve' }));
    expect(props.onApprove).toHaveBeenCalled();
  });

  it('shows the busy state on Approve and an alert above the bar', () => {
    renderReview({ busy: true, notice: 'Approving needs a sign-in from the last 12 hours.' });
    expect(screen.getByRole('button', { name: 'Approve' })).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('12 hours');
  });

  it('leaves Edit out where the editor cannot open', () => {
    renderReview({ onEdit: undefined });
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('keeps every field read-only: no handlers, no buttons on the page', () => {
    renderReview();
    const page = screen.getByRole('region', { name: 'Page 1 of 3' });
    expect(within(page).queryAllByRole('button')).toHaveLength(0);
  });

  describe('on a phone', () => {
    it('steps with header arrows and by swiping', async () => {
      const user = userEvent.setup();
      const { props } = renderReview({ step: 2, isMobile: true });
      expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Next page' }));
      expect(props.onStepChange).toHaveBeenLastCalledWith(3);
      await user.click(screen.getByRole('button', { name: 'Previous page' }));
      expect(props.onStepChange).toHaveBeenLastCalledWith(1);

      const area = screen.getByRole('region', { name: 'Page 2 of 3' }).parentElement as HTMLElement;
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 80, clientY: 110 }] });
      expect(props.onStepChange).toHaveBeenLastCalledWith(3);
      fireEvent.touchStart(area, { touches: [{ clientX: 80, clientY: 100 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 220, clientY: 100 }] });
      expect(props.onStepChange).toHaveBeenLastCalledWith(1);
    });

    it('ignores a mostly vertical drag', () => {
      const { props } = renderReview({ step: 2, isMobile: true });
      const area = screen.getByRole('region', { name: 'Page 2 of 3' }).parentElement as HTMLElement;
      fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
      fireEvent.touchEnd(area, { changedTouches: [{ clientX: 120, clientY: 400 }] });
      expect(props.onStepChange).not.toHaveBeenCalled();
    });

    it('puts the summary in a bottom sheet over the last page, and closing goes back to it', async () => {
      const user = userEvent.setup();
      const { props } = renderReview({ step: 4, isMobile: true });

      const sheet = screen.getByRole('dialog', { name: 'All fields checked' });
      expect(within(sheet).getByText('Ada Lovelace')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Page 3 of 3' })).toBeInTheDocument();

      await user.click(within(sheet).getByRole('button', { name: 'Approve' }));
      expect(props.onApprove).toHaveBeenCalledTimes(1);
      await user.click(within(sheet).getByRole('button', { name: 'Edit' }));
      expect(props.onEdit).toHaveBeenCalledTimes(1);

      await user.keyboard('{Escape}');
      expect(props.onStepChange).toHaveBeenLastCalledWith(3);
    });
  });

  it('has no axe violations on a page', async () => {
    const { container } = renderReview();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations on the summary', async () => {
    const { container } = renderReview({ step: 4 });
    expect(await axe(container)).toHaveNoViolations();
  });
});
