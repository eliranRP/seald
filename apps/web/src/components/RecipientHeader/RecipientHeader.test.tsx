import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { RecipientHeader } from './RecipientHeader';

describe('RecipientHeader', () => {
  it('renders the doc title', () => {
    const { getByText } = renderWithTheme(
      <RecipientHeader docTitle="Master Services Agreement" docId="ABC-123" />,
    );
    expect(getByText('Master Services Agreement')).toBeInTheDocument();
  });

  it('renders the doc id', () => {
    const { getByText } = renderWithTheme(<RecipientHeader docTitle="Contract" docId="ABC-123" />);
    expect(getByText('ABC-123')).toBeInTheDocument();
  });

  it('renders sender name and doc id together when senderName is provided', () => {
    const { container } = renderWithTheme(
      <RecipientHeader docTitle="Contract" docId="ABC-123" senderName="Jamie Okonkwo" />,
    );
    // The Meta line interpolates a middot between sender and docId, so we use
    // substring matching rather than exact text.
    expect(container.textContent).toContain('From Jamie Okonkwo');
    expect(container.textContent).toContain('ABC-123');
  });

  it('renders step chip when stepLabel is set and hides it otherwise', () => {
    const { getByText, queryByText, rerender } = renderWithTheme(
      <RecipientHeader docTitle="Contract" docId="ABC-123" stepLabel="Step 2 of 4" />,
    );
    expect(getByText('Step 2 of 4')).toBeInTheDocument();
    rerender(<RecipientHeader docTitle="Contract" docId="ABC-123" />);
    expect(queryByText('Step 2 of 4')).toBeNull();
  });

  it('calls onExit when the Exit button is clicked, and hides the button when onExit is absent', async () => {
    const onExit = vi.fn();
    const { getByLabelText, queryByLabelText, rerender } = renderWithTheme(
      <RecipientHeader docTitle="Contract" docId="ABC-123" onExit={onExit} />,
    );
    await userEvent.click(getByLabelText('Exit'));
    expect(onExit).toHaveBeenCalledTimes(1);
    rerender(<RecipientHeader docTitle="Contract" docId="ABC-123" />);
    expect(queryByLabelText('Exit')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <RecipientHeader
        docTitle="Master Services Agreement"
        docId="ABC-123"
        senderName="Jamie Okonkwo"
        stepLabel="Step 2 of 4"
        onExit={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the underlying <header> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(<RecipientHeader ref={ref} docTitle="Contract" docId="ABC-123" />);
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('HEADER');
  });
});
