import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '@/test/renderWithTheme';
import { ConsentBar } from './ConsentBar';
import type { ConsentBarProps } from './ConsentBar.types';

const base: ConsentBarProps = {
  senderName: 'Eliran Azulay',
  fieldCount: 3,
  agreed: false,
  onAgreedChange: () => {},
  onStart: () => {},
  disclosureHref: '/legal/esign-disclosure',
  attestation: 'I can open and download a PDF on this device.',
};

describe('ConsentBar', () => {
  it('names the sender, the effort and the one consent', () => {
    const { getByText, getByRole } = renderWithTheme(<ConsentBar {...base} />);
    expect(getByText('Eliran Azulay asked you to sign')).toBeInTheDocument();
    expect(getByText('3 fields · ~1 min')).toBeInTheDocument();
    expect(getByRole('checkbox', { name: 'I agree to sign electronically' })).not.toBeChecked();
    expect(getByRole('link', { name: 'Disclosure' })).toHaveAttribute(
      'href',
      '/legal/esign-disclosure',
    );
  });

  it('keeps the device-access statement with the consent', () => {
    const { getByText } = renderWithTheme(<ConsentBar {...base} />);
    expect(getByText(/I can open and download a PDF on this device\./)).toBeInTheDocument();
  });

  it('starts only once the box is checked, and says why before that', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();
    const { getByRole, rerender } = renderWithTheme(<ConsentBar {...base} onStart={onStart} />);
    const start = getByRole('button', { name: 'Start' });
    expect(start).toBeEnabled();
    await user.click(start);
    expect(onStart).not.toHaveBeenCalled();
    expect(getByRole('alert')).toHaveTextContent('Tick the box to agree, then press Start.');
    expect(getByRole('checkbox')).toHaveFocus();
    rerender(<ConsentBar {...base} agreed onStart={onStart} />);
    expect(() => getByRole('alert')).toThrow();
    await user.click(getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('reports a change of the checkbox', async () => {
    const onAgreedChange = vi.fn();
    const user = userEvent.setup();
    const { getByRole } = renderWithTheme(<ConsentBar {...base} onAgreedChange={onAgreedChange} />);
    await user.click(getByRole('checkbox'));
    expect(onAgreedChange).toHaveBeenCalledWith(true);
  });

  it('shows an error and has no axe violations', async () => {
    const { getByRole, container } = renderWithTheme(
      <ConsentBar {...base} agreed error="We could not record your acceptance." />,
    );
    expect(getByRole('alert')).toHaveTextContent('We could not record your acceptance.');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('works without a sender name and with a single field', () => {
    const { getByText } = renderWithTheme(
      <ConsentBar {...base} senderName={null} fieldCount={1} />,
    );
    expect(getByText('You have been asked to sign')).toBeInTheDocument();
    expect(getByText('1 field · ~1 min')).toBeInTheDocument();
  });
});
