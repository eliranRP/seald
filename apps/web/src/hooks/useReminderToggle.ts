import { useEffect, useState } from 'react';

export interface UseReminderToggleOptions {
  /** Controlled value. When omitted, the hook keeps its own state, starting on. */
  readonly enabled?: boolean | undefined;
  /** Changing this drops an in-flight optimistic value (a different envelope). */
  readonly sourceKey?: string | undefined;
  readonly onChange?: ((enabled: boolean) => void | Promise<void>) | undefined;
}

/**
 * Shared reminder switch state for the send flow and the envelope page.
 * A resolved promise keeps the optimistic value until the parent catches
 * up. A rejection restores the previous value.
 */
export function useReminderToggle(options: UseReminderToggleOptions): {
  readonly enabled: boolean;
  readonly pending: boolean;
  readonly onChange: (next: boolean) => void;
} {
  const [override, setOverride] = useState<boolean | null>(null);
  const [pending, setPending] = useState(false);
  const [seenKey, setSeenKey] = useState(options.sourceKey);
  if (options.sourceKey !== seenKey) {
    setSeenKey(options.sourceKey);
    setOverride(null);
    setPending(false);
  }
  const enabled = override ?? options.enabled ?? true;

  useEffect(() => {
    if (override !== null && options.enabled === override) setOverride(null);
  }, [options.enabled, override]);

  const onChange = (next: boolean): void => {
    setOverride(next);
    const result = options.onChange?.(next);
    if (result instanceof Promise) {
      setPending(true);
      void result.then(
        () => setPending(false),
        () => {
          setOverride(null);
          setPending(false);
        },
      );
    }
  };

  return { enabled, pending, onChange };
}
