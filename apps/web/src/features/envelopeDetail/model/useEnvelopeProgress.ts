import { useMemo } from 'react';
import type { Envelope } from '@/features/envelopes';
import { TERMINAL_STATUSES } from './lib';

export interface EnvelopeProgress {
  readonly signed: number;
  readonly total: number;
  readonly waiting: number;
  readonly pct: number;
  readonly isComplete: boolean;
  readonly isDeclined: boolean;
  readonly isTerminal: boolean;
  readonly hasPending: boolean;
}

const EMPTY_PROGRESS: EnvelopeProgress = {
  signed: 0,
  total: 0,
  waiting: 0,
  pct: 0,
  isComplete: false,
  isDeclined: false,
  isTerminal: false,
  hasPending: false,
};

/**
 * Single-pass derivation of the signing-progress numbers shown in the
 * progress card and used to gate header actions (rule 2.6 — consolidate
 * passes). Accepts `undefined` so callers can invoke the hook before the
 * envelope query resolves (rule 2.2 — hooks at top level).
 */
export function useEnvelopeProgress(envelope: Envelope | undefined): EnvelopeProgress {
  return useMemo(() => {
    if (!envelope) return EMPTY_PROGRESS;
    let signed = 0;
    let waiting = 0;
    let hasPending = false;
    for (const s of envelope.signers) {
      if (s.status === 'completed') signed += 1;
      else if (s.status === 'awaiting' || s.status === 'viewing') waiting += 1;
      if (s.signed_at === null && s.declined_at === null) hasPending = true;
    }
    const total = envelope.signers.length;
    const pct = total === 0 ? 0 : Math.round((signed / total) * 100);
    return {
      signed,
      total,
      waiting,
      pct,
      isComplete: envelope.status === 'completed',
      isDeclined: envelope.status === 'declined' || envelope.status === 'expired',
      isTerminal: TERMINAL_STATUSES.has(envelope.status),
      hasPending,
    };
  }, [envelope]);
}
