/**
 * sessionStorage-backed handoff for the Done / Declined pages. Once
 * `/sign/submit` or `/sign/decline` fires, the server clears the session
 * cookie, so we can no longer call `/sign/me`. The mutation handlers stash
 * the copy they'll need to render the terminal page here, before navigating.
 *
 * sessionStorage (not localStorage) is deliberate — a signer session must
 * not survive a browser restart. See spec §Out of scope + production
 * hardening note #8.
 */
/**
 * Item 23 — discriminates the two negative terminal paths so the
 * `SigningDeclinedPage` can show distinct copy for an explicit decline
 * vs. an ESIGN §7001(c)(1) consent withdrawal. Both routes navigate to
 * `/sign/:id/declined`; without this discriminator the page conflates
 * them under a single "You declined…" message which is wrong for a
 * user who chose withdrawal.
 */
export type DeclineReason = 'declined' | 'consent-withdrawn' | 'not-the-recipient';

export interface DoneSnapshot {
  readonly kind: 'submitted' | 'declined';
  readonly envelope_id: string;
  /**
   * 13-char public verify code (envelope.short_code). Stored on the
   * snapshot so the Done page can link to `/verify/<short_code>` after
   * the session cookie has been cleared and `/sign/me` is no longer
   * reachable.
   */
  readonly short_code: string;
  readonly title: string;
  readonly sender_name: string | null;
  readonly recipient_email: string;
  readonly timestamp: string;
  /**
   * Item 23 — optional discriminator for the declined-page copy. Only
   * meaningful when `kind === 'declined'`. Older snapshots may not
   * carry it (the reader treats missing as 'declined').
   */
  readonly decline_reason?: DeclineReason | undefined;
}

const KEY = 'sealed.sign.last';

export function writeDoneSnapshot(snapshot: DoneSnapshot): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify(snapshot));
}

/**
 * Runtime shape guard. The reader is the only consumer of the persisted
 * payload and it is reachable from a sessionStorage write that any other
 * tab on the same origin can perform; treat the payload as untrusted
 * input. A missing `short_code` once made the Done page render
 * `/verify/undefined`; a missing `recipient_email` rendered an empty
 * `<b></b>`. Both failure modes are silent in production. Validate the
 * minimum surface the consumers depend on, and return `null` when any of
 * it is missing or wrong-typed so callers fall back to their no-snapshot
 * path (a `<Navigate to="/sign/:id">` redirect).
 */
function isValidSnapshot(value: unknown): value is DoneSnapshot {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;
  if (v.kind !== 'submitted' && v.kind !== 'declined') return false;
  if (typeof v.envelope_id !== 'string' || v.envelope_id.length === 0) return false;
  if (typeof v.short_code !== 'string') return false;
  if (typeof v.recipient_email !== 'string' || v.recipient_email.length === 0) return false;
  // `title`, `timestamp` may be empty strings (server-side fallback when
  // the cached SignMe was already cleared); allow but require the type.
  if (typeof v.title !== 'string') return false;
  if (typeof v.timestamp !== 'string') return false;
  // `sender_name` is `string | null` on the wire.
  if (v.sender_name !== null && typeof v.sender_name !== 'string') return false;
  // Item 23 — `decline_reason` is optional. Treat unknown values as
  // missing so old snapshots from previous deploys don't fail the
  // shape-guard once we ship a tighter union.
  if (
    v.decline_reason !== undefined &&
    v.decline_reason !== 'declined' &&
    v.decline_reason !== 'consent-withdrawn' &&
    v.decline_reason !== 'not-the-recipient'
  ) {
    return false;
  }
  return true;
}

export function readDoneSnapshot(envelope_id: string): DoneSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isValidSnapshot(parsed)) return null;
  return parsed.envelope_id === envelope_id ? parsed : null;
}

export function clearDoneSnapshot(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
