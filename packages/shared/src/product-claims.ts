/**
 * User-facing product claims that must stay aligned with what the code
 * actually does. Marketing and the SPA should import these strings.
 * HTML email templates copy the sentences they need; they cannot import
 * TypeScript. The audit-trail cover line is rendered in `audit-pdf.tsx`.
 *
 * Do not describe the product as an advanced or qualified electronic
 * signature, or as legally equivalent to a handwritten signature.
 * Evidence: `apps/api/src/sealing/sealing.module.ts` (KMS, local P12, or
 * noop), `packages/shared/src/compliance.ts` (signer tier is an emailed
 * link), `apps/api/src/sealing/kms-cms-signer.ts` (timestamp is best-effort).
 */

/**
 * What a completed signature is. Shown on the signer prep and done screens.
 */
export const SIGNATURE_LEVEL_NOTE =
  'This is a simple electronic signature with ESIGN and UETA consent, a tamper-evident audit trail with a SHA-256 hash chain, and a PAdES-sealed PDF when a seal is applied. It is not an advanced or qualified electronic signature. Some documents still need wet ink or a qualified signature.';

/**
 * Intent affirmation on the review screen, recorded before the signed event.
 */
export const INTENT_TO_SIGN_NOTE =
  'By checking the box below and clicking Sign and submit, you intend to sign this document electronically. Legal effect depends on the document and the law that applies to it.';

/**
 * Hardware/software attestation on the prep screen. The signer has not
 * opened the PDF yet at this step (the fill view comes after Start
 * signing), so this is a statement of ability, not a completed download.
 */
export const RECORD_ACCESS_ATTESTATION = 'I can open and download a PDF on this device.';

/**
 * Signup age gate. Terms require 18, or 16 where that age can contract.
 * The product does not store a date of birth.
 */
export const AGE_CONSENT_PREFIX = "I'm 18 or older (16 where allowed), and I agree to Seald's ";

/** Matches the visible label, including "Seald's" and the two policy names. */
export const AGE_CONSENT_ARIA_LABEL =
  "I'm 18 or older (16 where allowed), and I agree to Seald's Terms of Service and Privacy Policy";

/**
 * Sealed files are kept until a deletion job exists. Nothing purges them
 * on a timer.
 */
export const RETENTION_NOTE =
  'You can verify this document for as long as we store it. We do not delete sealed files on a timer.';

/**
 * Sender-facing progress copy, shown after an envelope is sent.
 *
 * The lede stays to three sentences. The self-signer case is
 * `SENDER_PROGRESS_SELF_SIGNER_NOTE`, not part of this paragraph.
 *
 * Matches the outbox: `signed_to_sender` when someone else signs and
 * the envelope is not finished yet, `completed` to every party once
 * it is sealed, plus decline and expiry.
 */
export const SENDER_PROGRESS_NOTE =
  "Each signer gets their own link. We'll email you as people sign, if someone declines, or if the request expires. Everyone gets the finished document.";

/** Shown under the lede. Not part of that paragraph. */
export const SENDER_PROGRESS_SELF_SIGNER_NOTE =
  "If you are also a signer, we don't email you about your own signature.";

/**
 * Short auth-panel trust line. A noop signer applies no seal, and a
 * TSA failure leaves PAdES-B-B with no timestamp, so both caveats stay
 * on this line.
 */
export const PRODUCT_TRUST_LINE =
  'PAdES seal when applied · external timestamp when available · access-controlled storage';

/** Neutral value statement. Not a customer testimonial. */
export const PRODUCT_VALUE_STATEMENT =
  'A simple electronic signature, a hash-chained audit trail, and a PAdES-sealed PDF when a seal is applied.';

export const AUTH_PANEL_HEADING = 'Upload a PDF, place fields, and send a signing link.';

/** Password-reset screen. Supabase owns the link TTL; this repo does not. */
export const PASSWORD_RESET_NOTE = 'Use it soon; if it expires, request another.';

export const DOWNLOAD_MENU_NOTE =
  'Look up the envelope reference code on the verify page to see the SHA-256 and the audit trail.';

export const DRIVE_DISCONNECT_NOTE =
  'Disconnect any time. We revoke access at Google where we can and stop using the token. A copy stays in our database for now.';

export const SEAL_DOWNLOAD_ERROR =
  "We couldn't load the download yet. If sealing finishes, we'll email signers a link. You can also check the verify page.";
