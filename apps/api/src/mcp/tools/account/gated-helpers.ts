import type { McpToolAnnotations } from '../../tool';
import { APPROVAL_GUIDANCE } from '../send/send-helpers';

/**
 * The approval-gated account and key tools (WP-45, D5). Each asks the
 * owner and acts only after Approve on the Approve/Deny page, which
 * always needs a sign-in from the last 10 minutes.
 */
export const GATED_GUIDANCE = `Nothing happens until the account owner approves in Seald: the result is approval_pending with approve_requires session, and Approve needs a sign-in from the last 10 minutes. ${APPROVAL_GUIDANCE}`;

/** Inside Seald (no one outside the account is emailed); a retry with the same key is safe. */
export const GATED_ANNOTATIONS: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const GATED_DESTRUCTIVE_ANNOTATIONS: McpToolAnnotations = {
  ...GATED_ANNOTATIONS,
  destructiveHint: true,
};
