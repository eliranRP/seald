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
  | { readonly type: 'sign.consent_withdrawn'; readonly envelope_id: string }
  | {
      readonly type: 'sign.esign_disclosure.ack';
      readonly envelope_id: string;
      readonly version: string;
    }
  | { readonly type: 'sign.intent_to_sign.ack'; readonly envelope_id: string }
  | {
      readonly type: 'sign.error';
      readonly envelope_id: string | null;
      readonly status: number | null;
      readonly message: string;
    }
  // Mobile Google Drive integration (Phase 5). Three additive variants
  // emitted from `<MobileDrivePicker />` when the sender on /m/send taps
  // the "Import from Google Drive" tile, picks a file from the sheet,
  // and the conversion completes. Uses the same reporter seam so a host
  // build can swap the no-op for PostHog/Datadog without forking.
  | { readonly type: 'mobile.gdrive.picker_open'; readonly account_id: string }
  | {
      readonly type: 'mobile.gdrive.file_selected';
      readonly account_id: string;
      readonly mime_type: string;
    }
  | {
      readonly type: 'mobile.gdrive.converted';
      readonly account_id: string;
      readonly mime_type: string;
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
