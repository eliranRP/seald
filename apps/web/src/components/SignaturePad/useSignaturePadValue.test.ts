import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSignaturePadValue } from './useSignaturePadValue';

describe('useSignaturePadValue', () => {
  it('starts idle with null value', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    expect(result.current.status).toBe('idle');
    expect(result.current.value).toBeNull();
  });

  it('transitions idle -> active -> complete with a typed value', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    act(() => result.current.begin());
    expect(result.current.status).toBe('active');
    act(() => result.current.commit({ kind: 'typed', text: 'Jamie', font: 'caveat' }));
    expect(result.current.status).toBe('complete');
    expect(result.current.value).toEqual({ kind: 'typed', text: 'Jamie', font: 'caveat' });
  });

  it('reset() returns to idle and clears the value', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    act(() => result.current.begin());
    act(() => result.current.commit({ kind: 'typed', text: 'J', font: 'caveat' }));
    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');
    expect(result.current.value).toBeNull();
  });

  it('cancel() from active returns to idle', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    act(() => result.current.begin());
    act(() => result.current.cancel());
    expect(result.current.status).toBe('idle');
    expect(result.current.value).toBeNull();
  });

  it('throws invariant when committing from idle', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    expect(() =>
      act(() => {
        result.current.commit({ kind: 'typed', text: 'x', font: 'caveat' });
      }),
    ).toThrow(/invariant/i);
  });

  it('throws invariant when beginning while complete', () => {
    const { result } = renderHook(() => useSignaturePadValue());
    act(() => result.current.begin());
    act(() => result.current.commit({ kind: 'typed', text: 'x', font: 'caveat' }));
    expect(() => act(() => result.current.begin())).toThrow(/invariant/i);
  });

  it('accepts a controlled initialValue that makes it start complete', () => {
    const { result } = renderHook(() =>
      useSignaturePadValue({ initialValue: { kind: 'typed', text: 'x', font: 'caveat' } }),
    );
    expect(result.current.status).toBe('complete');
    expect(result.current.value).not.toBeNull();
  });
});
