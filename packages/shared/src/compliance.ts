/**
 * E-signature / consumer-disclosure compliance constants shared between
 * the API and the SPA. Keeping these in `packages/shared` ensures the UI
 * copy that captures consent and the audit-event metadata that records
 * it cannot drift. Versions are dates (YYYY-MM-DD) so a deployed seald
 * instance can correlate any `tc_accepted` event back to the exact
 * disclosure text the signer saw.
 *
 * Citations:
 * - ESIGN Act, 15 U.S.C. §7001(c)(1) — consumer-disclosure required
 *   elements (paper right, withdrawal procedure, scope, contact-update,
 *   hardware/software requirements).
 * - UETA §2(7), §5(b) — intent to conduct business electronically.
 * - eIDAS Art. 26 — AdES requirements (signatory identifiable + linked).
 */

/**
 * Version string for the ESIGN consumer disclosure rendered on the
 * signer prep page (`/legal/esign-disclosure` on the landing site, and
 * the in-flow checkbox on `/sign/:id/prep`). Bumped whenever the
 * user-visible disclosure copy changes; persisted into the audit chain
 * via two events so the trail is self-describing:
 *   - `tc_accepted` metadata.esign_disclosure_version (server-stamped
 *     in SigningService.acceptTerms — picks up THIS constant)
 *   - `esign_disclosure_acknowledged` metadata.esign_disclosure_version
 *     (passed in from the SPA via `acknowledgeEsignDisclosure(version)`,
 *     so the SPA must import THIS same constant — see
 *     SigningPrepPage.tsx)
 *
 * Keep this aligned with the version in
 * `apps/landing/src/pages/legal/esign-disclosure.astro` (`VERSION` in
 * the frontmatter). Don't repurpose old version strings; bump to a
 * fresh value when the disclosure copy changes so historical audit
 * events remain unambiguous.
 */
export const ESIGN_DISCLOSURE_VERSION = 'esign_v0.1';

/**
 * Default retention period for sealed envelopes, in years. Aligns with
 * the typical US contract statute of limitations (4–6 years for breach
 * of contract in most states) plus eIDAS preservation guidance, with a
 * one-year safety margin. Surface this to signers in the prep-page
 * footer, the completion email, and the audit certificate so they
 * know how long the record will remain accessible (ESIGN §7001(d) +
 * UETA §12).
 *
 * The API enforces (or rather, documents — automatic deletion is not
 * yet implemented) the same value via the `ENVELOPE_RETENTION_YEARS`
 * env var.
 */
export const ENVELOPE_RETENTION_YEARS_DEFAULT = 7;

/**
 * Mailto target for "Stop signing electronically and request paper
 * copies" — required by ESIGN §7001(c)(1)(B). Override per environment
 * via `VITE_LEGAL_CONTACT_EMAIL`; the default is intentionally a
 * placeholder so a misconfigured environment renders an obviously
 * invalid address rather than silently swallowing the request.
 */
export const LEGAL_CONTACT_EMAIL_DEFAULT = 'legal@seald.example';

/**
 * Document categories that ESIGN §7003 + UETA §3(b) + most state laws
 * exclude from electronic-signature legal effect. Surfaced as a
 * non-blocking warning to senders before they send an envelope. Not a
 * complete list — this is the "ask your lawyer first" set, not legal
 * advice. Member-state QES requirements (eIDAS Art. 25) are addressed
 * separately when the EU jurisdictional path is implemented.
 */
export const ESIGN_EXCLUDED_CATEGORIES = [
  'Wills, codicils, and testamentary trusts',
  'Family-law instruments (divorce, adoption, child custody)',
  'Court orders, judgments, and other court filings',
  'Notices of cancellation or termination of utility services',
  'Foreclosure or eviction notices',
  'Insurance benefit cancellations',
  'Hazardous-material handling and product-recall notices',
  'Real-estate conveyances in jurisdictions that require notarization',
] as const;

export type EsignExcludedCategory = (typeof ESIGN_EXCLUDED_CATEGORIES)[number];

/**
 * Authentication-tier disclosure surfaced in the audit certificate per
 * the saas-legal-advisor §2.7 risk-tier matrix. seald's signer flow
 * uses a magic link with an opaque token exchanged for a short-lived
 * HttpOnly cookie — that maps to "medium" tier (email-link delivery +
 * IP/UA capture). High and Critical tiers (KBA / ID document / video)
 * are not yet implemented; the disclosure tells consumers and senders
 * what level of attribution they got.
 */
export const SIGNER_AUTH_TIERS = ['low', 'medium', 'high', 'critical'] as const;
export type SignerAuthTier = (typeof SIGNER_AUTH_TIERS)[number];

/**
 * The current authentication tier the seald signer flow operates at.
 * Hard-coded today — magic-link delivery + IP/UA capture is medium.
 * When ID-document / KBA / video paths land, the producer will need
 * to record the tier-per-signer in the audit metadata.
 */
export const CURRENT_SIGNER_AUTH_TIER: SignerAuthTier = 'medium';
