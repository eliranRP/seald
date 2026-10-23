/** One `idempotency_records` row as the idempotency service sees it. */
export interface IdempotencyRecord {
  readonly request_hash: string;
  readonly path: string;
  /** Null while the call that claimed the key is still running. */
  readonly completed_at: string | null;
  readonly response_status: number;
  readonly response_body: unknown;
  readonly created_at: string;
}

export interface ClaimInput {
  readonly user_id: string;
  readonly idempotency_key: string;
  readonly method: string;
  readonly path: string;
  readonly request_hash: string;
  /** Rows live this long (the doc's 24 hours). */
  readonly ttl_seconds: number;
  /**
   * A claim that never completed (the process died mid-call) may be
   * taken over by a call with the same request after this long.
   */
  readonly stale_claim_seconds: number;
}

export type ClaimOutcome =
  | { readonly claimed: true }
  | { readonly claimed: false; readonly existing: IdempotencyRecord };

/**
 * Persistence port for MCP idempotency (docs/design/mcp-server.md § Rate
 * limits, idempotency, errors). The table is `idempotency_records`
 * (migration 0003, `completed_at` from 0029).
 */
export abstract class IdempotencyRecordsRepository {
  /**
   * Insert the row, or take over one that has expired or whose claim went
   * stale with the same request hash. Otherwise return the row as it is.
   */
  abstract claim(input: ClaimInput): Promise<ClaimOutcome>;

  /** Store the response of a claimed key. */
  abstract complete(
    user_id: string,
    idempotency_key: string,
    response_status: number,
    response_body: unknown,
  ): Promise<void>;

  /** Drop a claim that did not complete, so the client can retry the key. */
  abstract release(user_id: string, idempotency_key: string): Promise<void>;
}
