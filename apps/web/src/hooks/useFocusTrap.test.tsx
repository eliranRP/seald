import { useRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFocusTrap } from './useFocusTrap';

function Trap(props: { readonly open: boolean; readonly onEscape?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { onKeyDown } = useFocusTrap(ref, { enabled: props.open, onEscape: props.onEscape });
  if (!props.open) return null;
  return (
    <dialog ref={ref} open onKeyDown={onKeyDown}>
      <button type="button">First</button>
      <button type="button">Last</button>
    </dialog>
  );
}

describe('useFocusTrap', () => {
  it('wraps Tab from the last control back to the first', () => {
    render(<Trap open />);
    const last = screen.getByRole('button', { name: 'Last' });
    last.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }));
  });

  it('calls onEscape and returns focus to the trigger', () => {
    const onEscape = vi.fn();
    function Harness(props: { readonly open: boolean }) {
      return (
        <>
          <button type="button">Trigger</button>
          <Trap open={props.open} onEscape={onEscape} />
        </>
      );
    }
    const view = render(<Harness open={false} />);
    const trigger = screen.getByRole('button', { name: 'Trigger' });
    trigger.focus();
    view.rerender(<Harness open />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onEscape).toHaveBeenCalledTimes(1);
    view.rerender(<Harness open={false} />);
    expect(document.activeElement).toBe(trigger);
  });
});
