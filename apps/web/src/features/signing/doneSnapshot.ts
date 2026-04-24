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
export interface DoneSnapshot {
  readonly kind: 'submitted' | 'declined';
  readonly envelope_id: string;
  readonly title: string;
  readonly sender_name: string | null;
  readonly recipient_email: string;
  readonly timestamp: string;
}

const KEY = 'sealed.sign.last';

export function writeDoneSnapshot(snapshot: DoneSnapshot): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(KEY, JSON.stringify(snapshot));
}

export function readDoneSnapshot(envelope_id: string): DoneSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as DoneSnapshot;
    return parsed.envelope_id === envelope_id ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDoneSnapshot(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(KEY);
}
