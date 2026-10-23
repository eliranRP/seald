/** Today's MCP-caused sends of one owner (UTC day). */
export interface McpSendUsage {
  /** Envelopes sent by an MCP call (a `sent` event with `metadata.mcp`). */
  readonly sends: number;
  /** Recipients that were new when those envelopes went out. */
  readonly newRecipients: number;
}

/** Resend telemetry on the owner's signer mail over a window. */
export interface DeliveryHealth {
  /** Invite and reminder mails the provider accepted. */
  readonly sent: number;
  /** Of those, mails the provider reported bounced. */
  readonly bounced: number;
  /** Spam complaints on those mails. */
  readonly complaints: number;
}

/**
 * Persistence port for the MCP send guard (docs/design/mcp-server.md
 * § Rate limits: per-owner daily caps, bounce and complaint suspension).
 */
export abstract class SendGuardRepository {
  /**
   * `pg_advisory_xact_lock` on the owner, so two concurrent sends cannot
   * both pass a check-then-act. Held until the surrounding transaction
   * ends (the ambient one of the MCP call or the approval decision).
   */
  abstract lockOwner(ownerId: string): Promise<void>;

  /** `select … for update` on the envelope row, inside the surrounding transaction. */
  abstract lockEnvelope(envelopeId: string): Promise<void>;

  abstract usageSince(ownerId: string, since: Date): Promise<McpSendUsage>;

  abstract deliveryHealthSince(ownerId: string, since: Date): Promise<DeliveryHealth>;
}
