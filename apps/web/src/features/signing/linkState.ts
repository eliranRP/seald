/**
 * Link states of the signer flow: what a refused link looks like to the
 * signer, how the API's answer maps onto it, and the little the link page
 * needs to remember between the refusal and the page (sessionStorage, so
 * it dies with the tab and never reaches a URL).
 */
export type LinkStateKey = 'signed' | 'declined' | 'expired' | 'withdrawn' | 'notyet' | 'invalid';

export const LINK_STATE_KEYS: ReadonlyArray<LinkStateKey> = [
  'signed',
  'declined',
  'expired',
  'withdrawn',
  'notyet',
  'invalid',
];

export function isLinkStateKey(value: string | undefined): value is LinkStateKey {
  return value !== undefined && (LINK_STATE_KEYS as ReadonlyArray<string>).includes(value);
}

interface RefusalLike {
  readonly status?: number | undefined;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
  readonly reason?: string | undefined;
}

/**
 * Screen for a refusal of `/sign/start` or the session guard, or null when
 * the failure is not about the link (rate limit, network, server): those
 * keep their retry copy.
 */
export function linkStateFor(err: RefusalLike): LinkStateKey | null {
  switch (err.reason) {
    case 'already_signed':
      return 'signed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'canceled':
      return 'withdrawn';
    case 'not_your_turn':
      return 'notyet';
    default:
      break;
  }
  if (err.status === 409 && (err.code === 'not_your_turn' || err.message === 'not_your_turn')) {
    return 'notyet';
  }
  if (err.status === 429) return null;
  if (err.status === 400 || err.status === 401 || err.status === 404) return 'invalid';
  // 409 / 410 without a reason (an older API): the link works no more.
  if (err.status === 409 || err.status === 410) return 'invalid';
  return null;
}

export interface LinkHints {
  /** The link's token, kept only so "Ask for a new link" / "Try again" can use it. */
  readonly token?: string | undefined;
  readonly sender_name?: string | undefined;
  readonly waiting_on?: string | undefined;
  readonly signed_at?: string | undefined;
  readonly short_code?: string | undefined;
}

const KEY = (envelopeId: string): string => `seald:sign:link:${envelopeId}`;

export function stashLinkHints(envelopeId: string, hints: LinkHints): void {
  try {
    window.sessionStorage.setItem(KEY(envelopeId), JSON.stringify(hints));
  } catch {
    // Private mode or storage off: the page just shows the plain copy.
  }
}

export function readLinkHints(envelopeId: string): LinkHints {
  try {
    const raw = window.sessionStorage.getItem(KEY(envelopeId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const k of ['token', 'sender_name', 'waiting_on', 'signed_at', 'short_code'] as const) {
      const v = (parsed as Record<string, unknown>)[k];
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

export function clearLinkHints(envelopeId: string): void {
  try {
    window.sessionStorage.removeItem(KEY(envelopeId));
  } catch {
    // nothing to clear
  }
}

/** Hints out of an API refusal, plus the token the signer arrived with. */
export function hintsFromError(
  err: {
    readonly sender_name?: string | undefined;
    readonly waiting_on?: string | undefined;
    readonly signed_at?: string | undefined;
    readonly short_code?: string | undefined;
  },
  token: string | null,
): LinkHints {
  return {
    ...(token ? { token } : {}),
    ...(err.sender_name ? { sender_name: err.sender_name } : {}),
    ...(err.waiting_on ? { waiting_on: err.waiting_on } : {}),
    ...(err.signed_at ? { signed_at: err.signed_at } : {}),
    ...(err.short_code ? { short_code: err.short_code } : {}),
  };
}
