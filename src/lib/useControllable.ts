import { useCallback, useRef, useState } from 'react';

export interface UseControllableArgs<T> {
  readonly value?: T | undefined;
  readonly defaultValue?: T | undefined;
  readonly onChange?: ((value: T) => void) | undefined;
}

/** Supports controlled (value + onChange) and uncontrolled (defaultValue) modes. */
export function useControllable<T>(args: UseControllableArgs<T>): readonly [T, (next: T) => void] {
  const { value, defaultValue, onChange } = args;
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T | undefined>(defaultValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const current = (isControlled ? value : internal) as T;

  const set = useCallback(
    (next: T): void => {
      if (!isControlled) setInternal(next);
      onChangeRef.current?.(next);
    },
    [isControlled],
  );

  return [current, set] as const;
}
