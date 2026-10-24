import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { SignHeader } from './SignHeader';

describe('SignHeader', () => {
  it('shows only the logo without a title', () => {
    const { getByText, queryByRole } = renderWithTheme(<SignHeader />);
    expect(getByText('Seald')).toBeInTheDocument();
    expect(queryByRole('button')).toBeNull();
    expect(queryByRole('heading')).toBeNull();
  });

  it('shows the document, the sender and the download button', async () => {
    const onDownload = vi.fn();
    const user = userEvent.setup();
    const { getByRole, getByText, container } = renderWithTheme(
      <SignHeader title="NDA — Quill Capital" senderName="Eliran Azulay" onDownload={onDownload} />,
    );
    expect(getByRole('heading', { name: 'NDA — Quill Capital' })).toBeInTheDocument();
    expect(getByText('from Eliran Azulay')).toBeInTheDocument();
    await user.click(getByRole('button', { name: 'Download PDF' }));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('opens the More menu and runs the chosen entry', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = renderWithTheme(
      <SignHeader title="NDA" menu={[{ id: 'decline', label: 'Decline', onSelect }]} />,
    );
    await user.click(getByRole('button', { name: 'More' }));
    await user.click(getByRole('menuitem', { name: 'Decline' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
