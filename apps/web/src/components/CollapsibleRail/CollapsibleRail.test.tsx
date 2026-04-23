import { describe, it, expect, vi } from 'vitest';
import { fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { createRef } from 'react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { CollapsibleRail } from './CollapsibleRail';

const noop = (): void => {};

function dispatchMouseMove(movementX: number): void {
  const event = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'movementX', { value: movementX, configurable: true });
  window.dispatchEvent(event);
}

describe('CollapsibleRail', () => {
  it('renders the serif title in the header when open', () => {
    const { getByText } = renderWithTheme(
      <CollapsibleRail
        side="left"
        title="Fields"
        open
        onOpenChange={noop}
        width={280}
        onWidthChange={noop}
      >
        <div>content</div>
      </CollapsibleRail>,
    );
    expect(getByText('Fields')).toBeDefined();
  });

  it('renders the vertical title when collapsed', () => {
    const { getByText, getByRole } = renderWithTheme(
      <CollapsibleRail
        side="left"
        title="Fields"
        open={false}
        onOpenChange={noop}
        width={280}
        onWidthChange={noop}
      />,
    );
    expect(getByText('Fields')).toBeDefined();
    const toggle = getByRole('button', { name: 'Expand Fields' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('clicking the chevron calls onOpenChange(false) when open', async () => {
    const onOpenChange = vi.fn();
    const { getByRole } = renderWithTheme(
      <CollapsibleRail
        side="left"
        title="Fields"
        open
        onOpenChange={onOpenChange}
        width={280}
        onWidthChange={noop}
      />,
    );
    await userEvent.click(getByRole('button', { name: 'Collapse Fields' }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    const first = onOpenChange.mock.calls[0];
    const next = first ? first[0] : undefined;
    expect(next).toBe(false);
  });

  it('clicking the chevron calls onOpenChange(true) when collapsed', async () => {
    const onOpenChange = vi.fn();
    const { getByRole } = renderWithTheme(
      <CollapsibleRail
        side="right"
        title="Ready to send"
        open={false}
        onOpenChange={onOpenChange}
        width={280}
        onWidthChange={noop}
      />,
    );
    await userEvent.click(getByRole('button', { name: 'Expand Ready to send' }));
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    const first = onOpenChange.mock.calls[0];
    const next = first ? first[0] : undefined;
    expect(next).toBe(true);
  });

  it('dragging the resize handle on a left rail calls onWidthChange with clamped values', () => {
    const onWidthChange = vi.fn();
    const { getByRole } = renderWithTheme(
      <CollapsibleRail
        side="left"
        title="Fields"
        open
        onOpenChange={noop}
        width={300}
        onWidthChange={onWidthChange}
        minW={200}
        maxW={440}
      />,
    );
    const handle = getByRole('separator', { name: 'Resize Fields' });
    fireEvent.mouseDown(handle);
    // Grow by 50 → 350
    dispatchMouseMove(50);
    // Try to grow by another 500 → should clamp to 440
    dispatchMouseMove(500);
    fireEvent.mouseUp(window);

    expect(onWidthChange).toHaveBeenCalled();
    const firstCall = onWidthChange.mock.calls[0];
    const firstArg = firstCall ? firstCall[0] : undefined;
    expect(firstArg).toBe(350);
    const lastCall = onWidthChange.mock.calls[onWidthChange.mock.calls.length - 1];
    const lastArg = lastCall ? lastCall[0] : undefined;
    expect(lastArg).toBe(440);
  });

  it('dragging the resize handle on a right rail flips the delta sign', () => {
    const onWidthChange = vi.fn();
    const { getByRole } = renderWithTheme(
      <CollapsibleRail
        side="right"
        title="Summary"
        open
        onOpenChange={noop}
        width={300}
        onWidthChange={onWidthChange}
        minW={200}
        maxW={440}
      />,
    );
    const handle = getByRole('separator', { name: 'Resize Summary' });
    fireEvent.mouseDown(handle);
    // On the right side, moving mouse LEFT (negative movementX) grows the rail.
    dispatchMouseMove(-40);
    fireEvent.mouseUp(window);
    const firstCall = onWidthChange.mock.calls[0];
    const firstArg = firstCall ? firstCall[0] : undefined;
    expect(firstArg).toBe(340);
  });

  it('forwards ref to the root <aside> element', () => {
    const ref = createRef<HTMLElement>();
    renderWithTheme(
      <CollapsibleRail
        ref={ref}
        side="left"
        title="Fields"
        open
        onOpenChange={noop}
        width={280}
        onWidthChange={noop}
      />,
    );
    expect(ref.current).toBeInstanceOf(HTMLElement);
    expect(ref.current?.tagName).toBe('ASIDE');
  });

  it('has no axe violations when open', async () => {
    const { container } = renderWithTheme(
      <CollapsibleRail
        side="left"
        title="Fields"
        open
        onOpenChange={noop}
        width={280}
        onWidthChange={noop}
      >
        <div>content</div>
      </CollapsibleRail>,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations when collapsed', async () => {
    const { container } = renderWithTheme(
      <CollapsibleRail
        side="right"
        title="Summary"
        open={false}
        onOpenChange={noop}
        width={280}
        onWidthChange={noop}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
