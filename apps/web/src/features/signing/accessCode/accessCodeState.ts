import type { AccessCodeFailure } from './accessCodeErrors';

/**
 * The access-code form's step. Each request carries its own variant, so
 * "sending" always means a request is out, a failure only exists where it
 * is shown, and a successful submit ends in `verified` instead of a busy
 * flag left on.
 */
export type AccessCodePhase =
  /** Nothing sent yet, or a send failed before any code could be typed. */
  | { readonly kind: 'idle'; readonly failure: AccessCodeFailure | null }
  /** A first code (or a new one after a dead code) is on its way; no field yet. */
  | { readonly kind: 'sending' }
  /** The field is shown and a code can be typed. */
  | { readonly kind: 'ready'; readonly failure: AccessCodeFailure | null }
  /** The field stays shown while another code is on its way. */
  | { readonly kind: 'resending' }
  /** The typed code is being checked. */
  | { readonly kind: 'submitting' }
  /** The code was accepted; the host takes over, the form stays inert. */
  | { readonly kind: 'verified' }
  /** The last code is dead (locked, expired, never requested): ask for a new one. */
  | { readonly kind: 'needs-new'; readonly failure: AccessCodeFailure };

export interface AccessCodeState {
  readonly phase: AccessCodePhase;
  /** Epoch ms before which a new code cannot be requested; runs across phases. */
  readonly cooldownUntil: number;
}

export type AccessCodeEvent =
  | { readonly type: 'send' }
  | { readonly type: 'sent'; readonly at: number; readonly resendAfterSeconds: number }
  | { readonly type: 'send-failed'; readonly at: number; readonly failure: AccessCodeFailure }
  | { readonly type: 'submit' }
  | { readonly type: 'verified' }
  | { readonly type: 'submit-failed'; readonly at: number; readonly failure: AccessCodeFailure };

export const INITIAL_ACCESS_CODE_STATE: AccessCodeState = {
  phase: { kind: 'idle', failure: null },
  cooldownUntil: 0,
};

/** A request is out (or the code was accepted): every control is inert. */
export function isBusy(phase: AccessCodePhase): boolean {
  return (
    phase.kind === 'sending' ||
    phase.kind === 'resending' ||
    phase.kind === 'submitting' ||
    phase.kind === 'verified'
  );
}

/** The code field is on screen. */
export function showsCodeInput(phase: AccessCodePhase): boolean {
  return (
    phase.kind === 'ready' ||
    phase.kind === 'resending' ||
    phase.kind === 'submitting' ||
    phase.kind === 'verified'
  );
}

export function failureOf(phase: AccessCodePhase): AccessCodeFailure | null {
  return 'failure' in phase ? phase.failure : null;
}

function cooldownAfter(state: AccessCodeState, at: number, failure: AccessCodeFailure): number {
  return failure.retryAfterSeconds !== null
    ? at + failure.retryAfterSeconds * 1000
    : state.cooldownUntil;
}

/** Failures after which the typed code can never work again. */
const DEAD_CODE: ReadonlySet<AccessCodeFailure['kind']> = new Set([
  'locked',
  'expired',
  'not-requested',
]);

export function accessCodeReducer(state: AccessCodeState, event: AccessCodeEvent): AccessCodeState {
  const { phase } = state;
  switch (event.type) {
    case 'send':
      if (isBusy(phase)) return state;
      return { ...state, phase: { kind: phase.kind === 'ready' ? 'resending' : 'sending' } };
    case 'sent':
      if (phase.kind !== 'sending' && phase.kind !== 'resending') return state;
      return {
        phase: { kind: 'ready', failure: null },
        cooldownUntil: event.at + event.resendAfterSeconds * 1000,
      };
    case 'send-failed':
      if (phase.kind !== 'sending' && phase.kind !== 'resending') return state;
      return {
        // A recent code may still be live (cooldown); let the signer type it.
        phase:
          event.failure.kind === 'cooldown'
            ? { kind: 'ready', failure: event.failure }
            : { kind: 'idle', failure: event.failure },
        cooldownUntil: cooldownAfter(state, event.at, event.failure),
      };
    case 'submit':
      if (phase.kind !== 'ready') return state;
      return { ...state, phase: { kind: 'submitting' } };
    case 'verified':
      if (phase.kind !== 'submitting') return state;
      return { ...state, phase: { kind: 'verified' } };
    case 'submit-failed':
      if (phase.kind !== 'submitting') return state;
      return {
        phase: DEAD_CODE.has(event.failure.kind)
          ? { kind: 'needs-new', failure: event.failure }
          : { kind: 'ready', failure: event.failure },
        cooldownUntil: cooldownAfter(state, event.at, event.failure),
      };
    default: {
      const exhaustive: never = event;
      return exhaustive;
    }
  }
}
