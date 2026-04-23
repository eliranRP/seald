import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { PageToolbar } from './PageToolbar';

function baseProps() {
  return {
    currentPage: 2,
    totalPages: 4,
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onJumpToNextZone: vi.fn(),
  };
}

describe('PageToolbar', () => {
  it('renders "currentPage / totalPages" in the mono font', () => {
    const { getByText } = renderWithTheme(<PageToolbar {...baseProps()} />);
    const indicator = getByText('2 / 4');
    expect(indicator).toBeInTheDocument();
    expect(getComputedStyle(indicator).fontFamily).toMatch(/JetBrains Mono/);
  });

  it('fires onNextPage when Next is clicked', async () => {
    const props = baseProps();
    const { getByRole } = renderWithTheme(<PageToolbar {...props} />);
    await userEvent.click(getByRole('button', { name: 'Next page' }));
    expect(props.onNextPage).toHaveBeenCalledTimes(1);
  });

  it('fires onPrevPage when Prev is clicked', async () => {
    const props = baseProps();
    const { getByRole } = renderWithTheme(<PageToolbar {...props} />);
    await userEvent.click(getByRole('button', { name: 'Previous page' }));
    expect(props.onPrevPage).toHaveBeenCalledTimes(1);
  });

  it('disables Previous on page 1', () => {
    const { getByRole } = renderWithTheme(
      <PageToolbar {...baseProps()} currentPage={1} totalPages={4} />,
    );
    expect(getByRole('button', { name: 'Previous page' })).toHaveAttribute('disabled');
  });

  it('disables Next on the final page', () => {
    const { getByRole } = renderWithTheme(
      <PageToolbar {...baseProps()} currentPage={4} totalPages={4} />,
    );
    expect(getByRole('button', { name: 'Next page' })).toHaveAttribute('disabled');
  });

  it('omits the jump button + divider when onJumpToNextZone is undefined', () => {
    const { queryByRole } = renderWithTheme(
      <PageToolbar currentPage={2} totalPages={4} onPrevPage={vi.fn()} onNextPage={vi.fn()} />,
    );
    expect(queryByRole('button', { name: /Jump to next signature line/ })).toBeNull();
  });

  it('renders and fires the jump button when onJumpToNextZone is provided', async () => {
    const props = baseProps();
    const { getByRole } = renderWithTheme(<PageToolbar {...props} />);
    const jumpBtn = getByRole('button', { name: 'Jump to next signature line' });
    expect(jumpBtn).toBeInTheDocument();
    await userEvent.click(jumpBtn);
    expect(props.onJumpToNextZone).toHaveBeenCalledTimes(1);
  });

  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<PageToolbar ref={ref} {...baseProps()} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<PageToolbar {...baseProps()} />);
    expect(await axe(container)).toHaveNoViolations();
  });

  it('omits the zoom group when `zoom` is not supplied (backwards-compat)', () => {
    const { queryByRole } = renderWithTheme(<PageToolbar {...baseProps()} />);
    expect(queryByRole('button', { name: /zoom in/i })).toBeNull();
    expect(queryByRole('button', { name: /zoom out/i })).toBeNull();
  });

  it('renders a zoom group with a percentage readout and fires handlers', async () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();
    const { getByRole } = renderWithTheme(
      <PageToolbar
        {...baseProps()}
        zoom={1.25}
        onZoomIn={onZoomIn}
        onZoomOut={onZoomOut}
        onResetZoom={onResetZoom}
      />,
    );
    expect(getByRole('button', { name: /zoom 125%/i })).toBeInTheDocument();
    await userEvent.click(getByRole('button', { name: 'Zoom in' }));
    await userEvent.click(getByRole('button', { name: 'Zoom out' }));
    await userEvent.click(getByRole('button', { name: /zoom 125%/i }));
    expect(onZoomIn).toHaveBeenCalledTimes(1);
    expect(onZoomOut).toHaveBeenCalledTimes(1);
    expect(onResetZoom).toHaveBeenCalledTimes(1);
  });

  it('respects zoomInDisabled / zoomOutDisabled flags', () => {
    const { getByRole } = renderWithTheme(
      <PageToolbar
        {...baseProps()}
        zoom={2.5}
        onZoomIn={vi.fn()}
        onZoomOut={vi.fn()}
        zoomInDisabled
      />,
    );
    expect(getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(getByRole('button', { name: 'Zoom out' })).not.toBeDisabled();
  });
});
