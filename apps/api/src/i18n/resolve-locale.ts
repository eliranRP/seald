import { DEFAULT_LOCALE, isFeatureEnabled, matchSupportedLocale, type Locale } from 'shared';

/**
 * Locale for an outgoing, server-rendered artifact (WP-38).
 *
 *   signer-facing: signer.locale ?? envelope.locale ?? 'en'
 *   sender-facing: envelope.locale ?? 'en'  (pass no signerLocale)
 *
 * With the `i18n` flag off the answer is always `en`, whatever is stored.
 * Unsupported stored values also fall back to `en`.
 */
export function resolveContentLocale(args: {
  readonly envelopeLocale?: string | null | undefined;
  readonly signerLocale?: string | null | undefined;
}): Locale {
  if (!isFeatureEnabled('i18n')) return DEFAULT_LOCALE;
  return (
    matchSupportedLocale(args.signerLocale) ??
    matchSupportedLocale(args.envelopeLocale) ??
    DEFAULT_LOCALE
  );
}
