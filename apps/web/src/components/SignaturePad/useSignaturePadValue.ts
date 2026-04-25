import { useCallback, useState } from 'react';
import { invariant } from '@/lib/invariant';
import type { SignatureValue } from '@/types/sealdTypes';

export type SignaturePadStatus = 'idle' | 'active' | 'complete';

export interface UseSignaturePadValueOptions {
  readonly initialValue?: SignatureValue | null | undefined;
}

export interface UseSignaturePadValueResult {
  readonly status: SignaturePadStatus;
  readonly value: SignatureValue | null;
  readonly begin: () => void;
  readonly commit: (value: SignatureValue) => void;
  readonly cancel: () => void;
  readonly reset: () => void;
}

export function useSignaturePadValue(
  options: UseSignaturePadValueOptions = {},
): UseSignaturePadValueResult {
  const initial = options.initialValue ?? null;
  const [status, setStatus] = useState<SignaturePadStatus>(initial ? 'complete' : 'idle');
  const [value, setValue] = useState<SignatureValue | null>(initial);

  const begin = useCallback(() => {
    setStatus((s) => {
      invariant(s === 'idle', `SignaturePad: begin() requires status=idle, got ${s}`);
      return 'active';
    });
  }, []);

  const commit = useCallback((v: SignatureValue) => {
    setStatus((s) => {
      invariant(s === 'active', `SignaturePad: commit() requires status=active, got ${s}`);
      return 'complete';
    });
    setValue(v);
  }, []);

  const cancel = useCallback(() => {
    setStatus((s) => {
      invariant(s === 'active', `SignaturePad: cancel() requires status=active, got ${s}`);
      return 'idle';
    });
    setValue(null);
  }, []);

  const reset = useCallback(() => {
    setStatus('idle');
    setValue(null);
  }, []);

  return { status, value, begin, commit, cancel, reset };
}
