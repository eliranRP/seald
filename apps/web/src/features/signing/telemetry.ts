/**
 * Typed telemetry seam for the signing flow. The default implementation is
 * a no-op; a production build can swap `reportSignerEvent` for a real
 * observability hook (Sentry, Datadog, PostHog, etc.) without touching
 * pages or components.
 *
 * All signer events belong to one of the discriminated union below so
 * consumers can't emit an ad-hoc string.
 */
export type SignerEvent =
  | { readonly type: 'sign.link.opened'; readonly envelope_id: string; readonly has_token: boolean }
  | { readonly type: 'sign.session.started'; readonly envelope_id: string }
  | { readonly type: 'sign.tc.accepted'; readonly envelope_id: string }
  | {
      readonly type: 'sign.field.filled';
      readonly envelope_id: string;
      readonly field_id: string;
      readonly kind: string;
    }
  | {
      readonly type: 'sign.signature.uploaded';
      readonly envelope_id: string;
      readonly field_id: string;
      readonly format: 'drawn' | 'typed' | 'upload';
    }
  | { readonly type: 'sign.submitted'; readonly envelope_id: string }
  | { readonly type: 'sign.declined'; readonly envelope_id: string }
  | {
      readonly type: 'sign.error';
      readonly envelope_id: string | null;
      readonly status: number | null;
      readonly message: string;
    };

export type SignerReporter = (event: SignerEvent) => void;

let reporter: SignerReporter = () => {
  /* no-op default */
};

export function setSignerReporter(next: SignerReporter): void {
  reporter = next;
}

export function reportSignerEvent(event: SignerEvent): void {
  try {
    reporter(event);
  } catch {
    /* telemetry must never break the signing flow */
  }
}
