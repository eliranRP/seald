import { z } from 'zod';

/**
 * Signer access code (WP-10, migration 0026, flag `signerAccessAuth`).
 *
 * The sender can require an emailed one-time code before a signer opens
 * the document (`access_auth`), and again right before the signer submits
 * (`action_auth`). The second check covers the whole submit (every field
 * becomes binding at once), not only the signature fields.
 *
 * SMS codes are deferred: there is no SMS provider in the stack, so the
 * only method besides `none` is `email_otp`.
 *
 * Legal wording: this is an emailed one-time code. It proves control of
 * the mailbox at that time, nothing more. Copy and the certificate say
 * "emailed one-time code", never "identity verified"; the SES level in
 * `product-claims.ts` is unchanged.
 */
export const SIGNER_AUTH_METHODS = ['none', 'email_otp'] as const;
export type SignerAuthMethod = (typeof SIGNER_AUTH_METHODS)[number];

/** `access` gates the session; `action` re-checks right before submit. */
export const ACCESS_CODE_PURPOSES = ['access', 'action'] as const;
export type AccessCodePurpose = (typeof ACCESS_CODE_PURPOSES)[number];

/** Lifecycle limits. The API enforces them; the SPA reads them for copy. */
export const ACCESS_CODE_POLICY = {
  /** Digits in a code. */
  length: 6,
  /** A code stops working this long after it is emailed. */
  ttlSeconds: 10 * 60,
  /** Wrong guesses per code; the next one locks it and a new code is needed. */
  maxAttempts: 5,
  /** Minimum gap between two sends to the same signer. */
  resendCooldownSeconds: 60,
  /** Sends to one signer in any rolling hour. */
  maxSendsPerHour: 5,
} as const;

/** Six ASCII digits. */
export const ACCESS_CODE_PATTERN = /^[0-9]{6}$/;

/**
 * Value stored in `envelope_signers.verification_checks` once a signer
 * entered a correct emailed code. The address and time live in the
 * hash-chained `access_code_verified` event.
 */
export const VERIFICATION_CHECK_EMAIL_OTP = 'email_otp';

const uuid = z.guid();
const method = z.enum(SIGNER_AUTH_METHODS);

/**
 * `GET|PATCH /envelopes/:id/access-auth` response. Envelope values are the
 * defaults; a signer value of `null` inherits them. `effective_*` is what
 * the signer will actually face.
 */
export const AccessAuthSettingsSchema = z.object({
  access_auth: method,
  action_auth: method,
  signers: z.array(
    z.object({
      signer_id: uuid,
      access_auth: method.nullable(),
      action_auth: method.nullable(),
      effective_access_auth: method,
      effective_action_auth: method,
    }),
  ),
});
export type AccessAuthSettings = z.infer<typeof AccessAuthSettingsSchema>;

/** `PATCH /envelopes/:id/access-auth` body (drafts only). */
export const PatchAccessAuthRequestSchema = z.object({
  access_auth: method.optional(),
  action_auth: method.optional(),
  signers: z
    .array(
      z.object({
        signer_id: uuid,
        access_auth: method.nullable().optional(),
        action_auth: method.nullable().optional(),
      }),
    )
    .max(100)
    .optional(),
});
export type PatchAccessAuthRequest = z.infer<typeof PatchAccessAuthRequestSchema>;

/**
 * `POST /sign/start` when the signer must enter a code first. No signer
 * session is issued; a short-lived pending cookie lets the signer ask for
 * and enter the code.
 */
export const SignStartAccessCodeRequiredSchema = z.object({
  status: z.literal('access_code_required'),
  envelope_id: uuid,
  signer_id: uuid,
  email_masked: z.string(),
});
export type SignStartAccessCodeRequired = z.infer<typeof SignStartAccessCodeRequiredSchema>;

/** `POST /sign/access-code/send` body. `action` needs a full signer session. */
export const AccessCodeSendRequestSchema = z.object({
  purpose: z.enum(ACCESS_CODE_PURPOSES).optional(),
});
export type AccessCodeSendRequest = z.infer<typeof AccessCodeSendRequestSchema>;

export const AccessCodeSendResponseSchema = z.object({
  status: z.literal('sent'),
  purpose: z.enum(ACCESS_CODE_PURPOSES),
  email_masked: z.string(),
  expires_in_seconds: z.number().int(),
  resend_after_seconds: z.number().int(),
});
export type AccessCodeSendResponse = z.infer<typeof AccessCodeSendResponseSchema>;

/** `POST /sign/access-code/verify` body. */
export const AccessCodeVerifyRequestSchema = z.object({
  code: z.string().regex(ACCESS_CODE_PATTERN),
});
export type AccessCodeVerifyRequest = z.infer<typeof AccessCodeVerifyRequestSchema>;

/** `POST /sign/submit` body while `signerAccessAuth` is on. */
export const SignSubmitRequestSchema = z.object({
  access_code: z.string().regex(ACCESS_CODE_PATTERN).optional(),
});
export type SignSubmitRequest = z.infer<typeof SignSubmitRequestSchema>;

/**
 * Error slugs (`{ error: <slug> }`).
 *   access_code_not_requested  409  no live code (never sent, already used, or replaced)
 *   access_code_invalid        422  wrong code; attempts remain
 *   access_code_locked         423  too many wrong codes; ask for a new one
 *   access_code_expired        410  older than ttlSeconds; ask for a new one
 *   access_code_cooldown       429  resend too soon (Retry-After header)
 *   access_code_rate_limited   429  too many sends this hour (Retry-After header)
 *   access_code_required       428  submit without the re-verify code
 *   access_code_unavailable    503  the server has no SIGNER_OTP_KEY
 *   access_auth_not_required   409  this signer does not use a code
 */
export const ACCESS_CODE_ERROR_SLUGS = [
  'access_code_not_requested',
  'access_code_invalid',
  'access_code_locked',
  'access_code_expired',
  'access_code_cooldown',
  'access_code_rate_limited',
  'access_code_required',
  'access_code_unavailable',
  'access_auth_not_required',
] as const;
export type AccessCodeErrorSlug = (typeof ACCESS_CODE_ERROR_SLUGS)[number];

/**
 * `j***@example.com`. Keeps the first character of the local part and the
 * whole domain, so a signer recognizes the mailbox without the page or
 * the certificate spelling it out.
 */
export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${trimmed.charAt(0)}***${trimmed.slice(at)}`;
}

/** Signer value wins; `null` / missing inherits the envelope default. */
export function effectiveSignerAuth(
  envelopeValue: SignerAuthMethod,
  signerValue: SignerAuthMethod | null | undefined,
): SignerAuthMethod {
  return signerValue ?? envelopeValue;
}
