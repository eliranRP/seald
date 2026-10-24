import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { FinishSheet } from './FinishSheet';
import type { FinishSheetProps } from './FinishSheet.types';

const base: FinishSheetProps = {
  open: true,
  onClose: () => {},
  docTitle: 'NDA — Quill Capital',
  signerName: 'Hannah Wills',
  signerEmail: 'hannah@quill.vc',
  preview: <span>Hannah Wills</span>,
  onSign: () => {},
};

describe('FinishSheet', () => {
  it('names the document and the signer and states the intent', async () => {
    const { getByRole, getByText, container } = renderWithTheme(<FinishSheet {...base} />);
    expect(getByRole('dialog', { name: 'Finish signing' })).toBeInTheDocument();
    expect(getByRole('heading', { name: 'Sign NDA — Quill Capital' })).toBeInTheDocument();
    expect(getByText('as Hannah Wills · hannah@quill.vc')).toBeInTheDocument();
    expect(getByText('Legally binding · PAdES sealed')).toBeInTheDocument();
    expect(getByText(/you intend to sign this document electronically/i)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('Sign runs the caller, Back closes', async () => {
    const onSign = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = renderWithTheme(
      <FinishSheet {...base} onSign={onSign} onClose={onClose} />,
    );
    await user.click(getByRole('button', { name: 'Sign' }));
    expect(onSign).toHaveBeenCalledTimes(1);
    await user.click(getByRole('button', { name: 'Back' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('swaps the buttons for the code form when one is needed, and shows errors', () => {
    const { getByText, queryByRole, getByRole } = renderWithTheme(
      <FinishSheet {...base} codeForm={<p>code form</p>} error="Wrong code" />,
    );
    expect(getByText('code form')).toBeInTheDocument();
    expect(queryByRole('button', { name: 'Sign' })).toBeNull();
    expect(getByRole('alert')).toHaveTextContent('Wrong code');
  });
});
