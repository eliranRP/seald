import { describe, it, expect } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  it('renders role=progressbar with aria-valuemin=0, aria-valuemax matching prop, and aria-valuenow within range', () => {
    const { getByRole } = renderWithTheme(<ProgressBar value={2} max={5} />);
    const root = getByRole('progressbar');
    expect(root).toHaveAttribute('aria-valuemin', '0');
    expect(root).toHaveAttribute('aria-valuemax', '5');
    expect(root).toHaveAttribute('aria-valuenow', '2');
  });

  it('defaults aria-label to "{value} of {max}" when no label provided', () => {
    const { getByRole } = renderWithTheme(<ProgressBar value={2} max={5} />);
    expect(getByRole('progressbar')).toHaveAttribute('aria-label', '2 of 5');
  });

  it('honors an explicit label prop', () => {
    const { getByRole } = renderWithTheme(
      <ProgressBar value={2} max={5} label="Signing progress" />,
    );
    expect(getByRole('progressbar')).toHaveAttribute('aria-label', 'Signing progress');
  });

  it('applies data-tone="indigo" by default and data-tone="success" when tone is success', () => {
    const { getByRole, rerender } = renderWithTheme(<ProgressBar value={1} max={3} />);
    const rootDefault = getByRole('progressbar');
    const filledDefault = rootDefault.firstElementChild?.firstElementChild;
    expect(filledDefault).toHaveAttribute('data-tone', 'indigo');

    rerender(<ProgressBar value={3} max={3} tone="success" />);
    const rootSuccess = getByRole('progressbar');
    const filledSuccess = rootSuccess.firstElementChild?.firstElementChild;
    expect(filledSuccess).toHaveAttribute('data-tone', 'success');
  });

  it('clamps aria-valuenow to max when value > max', () => {
    const { getByRole } = renderWithTheme(<ProgressBar value={7} max={5} />);
    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
  });

  it('clamps aria-valuenow to 0 when value < 0', () => {
    const { getByRole } = renderWithTheme(<ProgressBar value={-3} max={5} />);
    expect(getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('never renders the filled child with negative or greater-than-100 width', () => {
    const { getByRole, rerender } = renderWithTheme(<ProgressBar value={7} max={5} />);
    const rootOver = getByRole('progressbar');
    const filledOver = rootOver.firstElementChild?.firstElementChild as HTMLElement;
    expect(filledOver.style.width).toBe('100%');

    rerender(<ProgressBar value={-3} max={5} />);
    const rootUnder = getByRole('progressbar');
    const filledUnder = rootUnder.firstElementChild?.firstElementChild as HTMLElement;
    expect(filledUnder.style.width).toBe('0%');
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(<ProgressBar value={2} max={5} label="Progress" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards ref to the root div', () => {
    const ref = { current: null as HTMLDivElement | null };
    renderWithTheme(<ProgressBar ref={ref} value={1} max={3} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('forwards rest props (className, data-*) to the root element', () => {
    const { getByRole } = renderWithTheme(
      <ProgressBar value={1} max={3} data-testid="pb" className="custom" />,
    );
    const root = getByRole('progressbar');
    expect(root).toHaveAttribute('data-testid', 'pb');
    expect(root).toHaveClass('custom');
  });
});
