/**
 * User-facing product claims that must stay aligned with what the code
 * actually does. Marketing, the SPA, transactional email, and the audit
 * PDF should import these strings (or, for HTML templates, copy them
 * verbatim — `template.service.spec.ts` checks that).
 *
 * Do not describe the product as an advanced or qualified electronic
 * signature, or as legally equivalent to a handwritten signature.
 * Evidence: `apps/api/src/sealing/sealing.module.ts` (KMS, local P12, or
 * noop), `packages/shared/src/compliance.ts` (signer tier is an emailed
 * link), `apps/api/src/sealing/kms-cms-signer.ts` (timestamp is best-effort).
 */

/** Operating company. Legal pages are revised separately and may still say "Seald, Inc." */
export const LEGAL_ENTITY_NAME = 'NRO Momentum LLC';

export const LEGAL_POSTAL_ADDRESS =
  '3401 Hartzdale Drive, Suite 103B, Unit #631, Camp Hill, PA 17011';

/**
 * What a completed signature is. Shown on the signer prep and done screens.
 */
export const SIGNATURE_LEVEL_NOTE =
  'This is a simple electronic signature with ESIGN and UETA consent, a tamper-evident audit trail with a SHA-256 hash chain, and a PAdES-sealed PDF when sealing is configured. It is not an advanced or qualified electronic signature. Some documents still need wet ink or a qualified signature.';

/**
 * Intent affirmation on the review screen, recorded before the signed event.
 */
export const INTENT_TO_SIGN_NOTE =
  'By checking this box and clicking Sign and submit, you intend to sign this document electronically. We record that intent in the audit trail. Legal effect depends on the document and the law that applies to it.';

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
export const AGE_CONSENT_PREFIX =
  "I am at least 18 (or 16 where the law lets me sign contracts at 16), and I agree to Seald's ";

export const AGE_CONSENT_ARIA_LABEL =
  'I am at least 18 (or 16 where the law lets me sign contracts at 16), and I agree to the Terms of Service and Privacy Policy';

/**
 * Sealed files are kept until a deletion job exists. `ENVELOPE_RETENTION_YEARS`
 * only changes a label; it does not purge anything.
 */
export const RETENTION_NOTE =
  'You can verify this document for as long as we store it. We do not delete sealed files on a timer.';

/**
 * Sender-facing progress copy, shown after an envelope is sent.
 *
 * Update this string when per-signature and seal emails to the sender
 * ship. Today the sender is emailed only on decline (`declined_to_sender`)
 * and expiry (`expired_to_sender`). The `completed` mail goes to signers
 * who have `signed_at` set (`sealing.service.ts`). There is no
 * `signed_to_sender` template.
 */
export const SENDER_PROGRESS_NOTE =
  "Each signer gets their own link. You can watch progress on the envelope. We'll email you if someone declines or if the request expires. Signers receive the sealed-file email when everyone has signed.";

/** Auth-panel trust line. No AES-256-at-rest or guaranteed PAdES-LT claim. */
export const PRODUCT_TRUST_LINE =
  'PAdES seal when configured · external timestamp when available · access-controlled storage';

/** Neutral value statement. Not a customer testimonial. */
export const PRODUCT_VALUE_STATEMENT =
  'A simple electronic signature, a hash-chained audit trail, and a PAdES-sealed PDF when sealing is configured.';

export const AUTH_PANEL_HEADING = 'Upload a PDF, place fields, and send a signing link.';

/** Password-reset screen. Supabase owns the link TTL; this repo does not. */
export const PASSWORD_RESET_NOTE =
  'Use it soon; if it expires, request another.';

export const DOWNLOAD_MENU_NOTE =
  'Look up the envelope reference code on the verify page to see the SHA-256 and the audit trail.';

export const DRIVE_DISCONNECT_NOTE =
  'Disconnect any time. We revoke the token at Google when we can, and we stop using it. The encrypted token stays in our database until we add a hard-delete job.';

export const SEAL_DOWNLOAD_ERROR =
  "We couldn't load the download yet. If sealing finishes, we'll email signers a link. You can also try the verify page again.";

export const EMAIL_TRANSIT_NOTE =
  'Sent over HTTPS. Documents are stored in access-controlled cloud storage.';

export const EMAIL_QUESTIONS_LABEL = 'Questions about these emails';

export const EMAIL_SIGNATURE_NOTE =
  'Seald records a simple electronic signature with ESIGN and UETA consent, keeps a tamper-evident audit trail with a SHA-256 hash chain, and adds a PAdES seal to the PDF when sealing is configured. It is not an advanced or qualified electronic signature. Whether that is enough depends on the document and where it will be enforced.';

export const EMAIL_COMPLETED_NOTE =
  'Everyone has signed. Download the sealed PDF and the separate audit PDF from the links below. If a digital seal was applied, changing the PDF breaks that seal.';

export const EMAIL_RETRY_NOTE =
  'To try again, start a new envelope from the dashboard and upload the PDF.';

export const EMAIL_KEPT_NOTE =
  'Your copy and the audit trail are kept. We do not delete them on a timer.';

export const AUDIT_PDF_OPERATOR_LINE =
  'Stored until deleted under our privacy policy. Electronic signature with a PAdES seal from the issuer when sealing is configured. Not an advanced or qualified electronic signature.';
