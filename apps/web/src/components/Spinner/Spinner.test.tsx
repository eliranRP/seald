import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('announces a status when labelled', () => {
    const { getByRole } = renderWithTheme(<Spinner label="Sealing" />);
    expect(getByRole('status', { name: 'Sealing' })).toBeInTheDocument();
  });

  it('is decorative without a label', () => {
    const { container, queryByRole } = renderWithTheme(<Spinner />);
    expect(queryByRole('status')).toBeNull();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards ref', () => {
    const ref = createRef<HTMLSpanElement>();
    renderWithTheme(<Spinner ref={ref} size="lg" />);
    expect(ref.current).toBeInstanceOf(HTMLSpanElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<Spinner label="Loading" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
