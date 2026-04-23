import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef, useState } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignatureField } from './SignatureField';

describe('SignatureField', () => {
  it('is role="button" with verbose aria-label', () => {
    const { getByRole } = renderWithTheme(<SignatureField kind="signature" signerName="Jamie" />);
    expect(getByRole('button', { name: /signature field for Jamie/i })).toBeInTheDocument();
  });

  it('reports filled state in the aria-label', () => {
    const { getByRole } = renderWithTheme(
      <SignatureField kind="signature" signerName="Jamie" filled />,
    );
    expect(getByRole('button', { name: /, signed/i })).toBeInTheDocument();
  });

  it('Enter / Space toggle selection (aria-pressed)', async () => {
    function Harness() {
      const [sel, setSel] = useState(false);
      return (
        <SignatureField
          kind="signature"
          signerName="Jamie"
          selected={sel}
          onClick={() => setSel((s) => !s)}
        />
      );
    }
    const { getByRole } = renderWithTheme(<Harness />);
    const el = getByRole('button');
    el.focus();
    await userEvent.keyboard('{Enter}');
    expect(el).toHaveAttribute('aria-pressed', 'true');
    await userEvent.keyboard(' ');
    expect(el).toHaveAttribute('aria-pressed', 'false');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<SignatureField kind="initials" signerName="Jamie" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<SignatureField ref={ref} kind="signature" signerName="Jamie" />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards data-* rest props to the root element', () => {
    const { container } = renderWithTheme(
      <SignatureField kind="signature" signerName="Jamie" data-testid="sig-field" />,
    );
    expect(container.querySelector('[data-testid="sig-field"]')).not.toBeNull();
  });
});
