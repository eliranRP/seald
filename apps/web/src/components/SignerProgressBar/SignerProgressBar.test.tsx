import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignerProgressBar } from './SignerProgressBar';
import type { SignerProgressBarEntry } from './SignerProgressBar.types';

const signers: ReadonlyArray<SignerProgressBarEntry> = [
  { id: '1', status: 'signed' },
  { id: '2', status: 'pending' },
  { id: '3', status: 'declined' },
];

describe('SignerProgressBar', () => {
  it('renders one segment per signer', () => {
    const { container } = renderWithTheme(<SignerProgressBar signers={signers} />);
    const track = container.firstChild as HTMLElement;
    expect(track.childElementCount).toBe(3);
  });

  it('exposes correct aria-valuenow / aria-valuemax', () => {
    renderWithTheme(<SignerProgressBar signers={signers} />);
    const track = screen.getByRole('progressbar');
    expect(track.getAttribute('aria-valuenow')).toBe('1');
    expect(track.getAttribute('aria-valuemax')).toBe('3');
  });

  it('uses custom aria-label when provided', () => {
    renderWithTheme(<SignerProgressBar signers={signers} aria-label="x" />);
    expect(screen.getByLabelText('x')).toBeInTheDocument();
  });

  it('handles empty lists gracefully', () => {
    const { container } = renderWithTheme(<SignerProgressBar signers={[]} />);
    const track = container.firstChild as HTMLElement;
    expect(track.childElementCount).toBe(0);
    expect(track.getAttribute('aria-valuemax')).toBe('0');
    expect(track.getAttribute('aria-valuenow')).toBe('0');
  });
});
