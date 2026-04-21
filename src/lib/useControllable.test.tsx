import { act } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useControllable } from './useControllable';

function Harness<T>({
  value,
  defaultValue,
  onChange,
}: {
  value?: T | undefined;
  defaultValue?: T | undefined;
  onChange?: (v: T) => void;
}) {
  const [state, setState] = useControllable<T>({ value, defaultValue, onChange });
  // expose setter on window for assertion convenience
  (window as unknown as { testSetter: (v: T) => void }).testSetter = setState;
  return <span data-testid="out">{String(state)}</span>;
}

describe('useControllable', () => {
  it('uncontrolled: uses defaultValue and updates locally', () => {
    const { getByTestId } = render(<Harness defaultValue="a" />);
    expect(getByTestId('out').textContent).toBe('a');
    act(() => {
      (window as unknown as { testSetter: (v: string) => void }).testSetter('b');
    });
    expect(getByTestId('out').textContent).toBe('b');
  });

  it('controlled: ignores local set, reflects prop', () => {
    const onChange = vi.fn();
    const { getByTestId, rerender } = render(<Harness value="x" onChange={onChange} />);
    expect(getByTestId('out').textContent).toBe('x');
    act(() => {
      (window as unknown as { testSetter: (v: string) => void }).testSetter('y');
    });
    expect(onChange).toHaveBeenCalledWith('y');
    // prop did not change, so render still shows x
    expect(getByTestId('out').textContent).toBe('x');
    rerender(<Harness value="y" onChange={onChange} />);
    expect(getByTestId('out').textContent).toBe('y');
  });
});
