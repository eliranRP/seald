import { randomUUID } from 'node:crypto';
import type { ApprovalStatus } from 'shared';
import {
  approvalStatus,
  hasNoOutcome,
  isOpen,
  matchToken,
  planAgentRepreview,
  type ApprovalRecord,
  type TokenMatch,
} from '../src/approvals/approval-state';
import {
  ApprovalsRepository,
  type ApprovalKeyFacts,
  type ClaimDecisionInput,
  type ConsumeConfirmationInput,
  type InsertConfirmationInput,
  type ListApprovalsInput,
  type OpenApprovalInput,
  type OpenApprovalResult,
  type OwnerEditInput,
  type OwnerMailbox,
} from '../src/approvals/approvals.repository';
import type { InsertOutboundEmailInput } from '../src/email/outbound-emails.repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface StoredConfirmation extends InsertConfirmationInput {
  consumedAt: string | null;
}

/**
 * In-memory `ApprovalsRepository` for unit specs and in-memory e2e boots.
 * Mirrors the conditional updates of the Postgres adapter: each method
 * runs to completion without awaiting, so it is atomic in one event loop.
 */
export class InMemoryApprovalsRepository extends ApprovalsRepository {
  readonly rows: Mutable<ApprovalRecord>[] = [];
  readonly keys = new Map<string, ApprovalKeyFacts>();
  /** WP-27: OAuth grants as key facts, by grant id. */
  readonly grants = new Map<string, ApprovalKeyFacts>();
  /** WP-27: optional live source for grants (the in-memory OAuth repository). */
  grantSource: ((id: string) => Promise<ApprovalKeyFacts | null>) | null = null;
  readonly mailboxes = new Map<string, OwnerMailbox>();
  /** owner id → lower-cased known addresses. */
  readonly known = new Map<string, Set<string>>();
  readonly emails: InsertOutboundEmailInput[] = [];
  readonly confirmations: StoredConfirmation[] = [];
  /** All outbound mail counted by the breaker (day, month). */
  outboundVolume = { day: 0, month: 0 };

  async findKeyFacts(apiKeyId: string): Promise<ApprovalKeyFacts | null> {
    return this.keys.get(apiKeyId) ?? null;
  }

  async findGrantFacts(oauthGrantId: string): Promise<ApprovalKeyFacts | null> {
    if (this.grantSource) return this.grantSource(oauthGrantId);
    return this.grants.get(oauthGrantId) ?? null;
  }

  async findOwnerMailbox(ownerId: string): Promise<OwnerMailbox | null> {
    return this.mailboxes.get(ownerId) ?? null;
  }

  async findKnownRecipients(ownerId: string, emails: readonly string[]): Promise<Set<string>> {
    const known = this.known.get(ownerId) ?? new Set<string>();
    return new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => known.has(e)));
  }

  /** Request mails of this owner (specs stay inside one UTC day). */
  private mailsToday(ownerId: string, _now: Date): number {
    return this.emails.filter(
      (e) =>
        e.kind === 'approval_request' &&
        this.rows.some((r) => r.id === e.payload['approval_id'] && r.ownerId === ownerId),
    ).length;
  }

  private insertEmail(input: InsertOutboundEmailInput): void {
    if (input.dedupe_key && this.emails.some((e) => e.dedupe_key === input.dedupe_key)) return;
    this.emails.push(input);
  }

  async openOrRepreview(input: OpenApprovalInput): Promise<OpenApprovalResult> {
    const now = input.now;
    for (const r of this.rows) {
      if (
        r.ownerId === input.ownerId &&
        r.kind === input.kind &&
        r.subjectKey === input.subjectKey &&
        hasNoOutcome(r) &&
        Date.parse(r.expiresAt) <= now.getTime()
      ) {
        r.expiredAt = now.toISOString();
        r.expiredReason = 'ttl';
      }
    }
    const open = this.rows.find(
      (r) =>
        r.ownerId === input.ownerId &&
        r.kind === input.kind &&
        r.subjectKey === input.subjectKey &&
        hasNoOutcome(r),
    );
    const capped = () =>
      input.email !== null && this.mailsToday(input.ownerId, now) >= input.maxMailsPerOwnerPerDay;
    if (open) {
      const plan = planAgentRepreview(open, input.subjectHash, now);
      if (plan.kind === 'unchanged') return { outcome: 'unchanged', record: { ...open } };
      if (capped()) return { outcome: 'limit_mail' };
      Object.assign(open, {
        subjectHash: plan.subjectHash,
        summary: input.summary,
        args: input.args,
        approveRequires: input.approveRequires,
        notify: input.notify,
        linkTokenHash: null,
        previousTokenHash: null,
        priorTokenHashes: [...plan.priorTokenHashes],
        expiresAt: plan.expiresAt,
        updatedAt: now.toISOString(),
      });
      if (input.email) {
        this.insertEmail(
          input.email({ ...open }, `approval_request:${open.id}:${open.subjectHash}`),
        );
      }
      return { outcome: 'repreviewed', record: { ...open } };
    }
    if (
      input.apiKeyId !== null &&
      this.rows.filter((r) => r.apiKeyId === input.apiKeyId && isOpen(r, now)).length >=
        input.maxOpenPerKey
    ) {
      return { outcome: 'limit_open' };
    }
    if (
      input.apiKeyId === null &&
      input.oauthGrantId !== null &&
      this.rows.filter((r) => r.oauthGrantId === input.oauthGrantId && isOpen(r, now)).length >=
        input.maxOpenPerKey
    ) {
      return { outcome: 'limit_open' };
    }
    if (capped()) return { outcome: 'limit_mail' };
    const at = now.toISOString();
    const row: Mutable<ApprovalRecord> = {
      id: randomUUID(),
      ownerId: input.ownerId,
      apiKeyId: input.apiKeyId,
      oauthGrantId: input.oauthGrantId,
      kind: input.kind,
      tool: input.tool,
      subjectKey: input.subjectKey,
      envelopeId: input.envelopeId,
      args: input.args,
      summary: input.summary,
      subjectHash: input.subjectHash,
      linkTokenHash: null,
      previousTokenHash: null,
      priorTokenHashes: [],
      notify: input.notify,
      approveRequires: input.approveRequires,
      ownerEditedAt: null,
      expiresAt: input.expiresAt,
      approvedAt: null,
      deniedAt: null,
      failedAt: null,
      expiredAt: null,
      completedAt: null,
      expiredReason: null,
      decidedVia: null,
      resultSlug: null,
      result: null,
      createdAt: at,
      updatedAt: at,
    };
    this.rows.push(row);
    if (input.email) this.insertEmail(input.email({ ...row }, `approval_request:${row.id}`));
    return { outcome: 'created', record: { ...row } };
  }

  async findById(id: string): Promise<ApprovalRecord | null> {
    const row = this.rows.find((r) => r.id === id);
    return row ? { ...row } : null;
  }

  async findByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly record: ApprovalRecord; readonly match: TokenMatch } | null> {
    for (const row of this.rows) {
      const match = matchToken(row, tokenHash);
      if (match) return { record: { ...row }, match };
    }
    return null;
  }

  async armLinkToken(
    id: string,
    subjectHash: string,
    tokenHash: string,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const row = this.rows.find(
      (r) => r.id === id && r.subjectHash === subjectHash && r.notify === 'email' && isOpen(r, now),
    );
    if (!row) return null;
    row.linkTokenHash = tokenHash;
    return { ...row };
  }

  async markExpired(id: string, reason: string, now: Date): Promise<ApprovalRecord | null> {
    const row = this.rows.find((r) => r.id === id && hasNoOutcome(r));
    if (!row) return null;
    row.expiredAt = now.toISOString();
    row.expiredReason = reason;
    return { ...row };
  }

  async markFailedUndecided(
    id: string,
    slug: string,
    d: Parameters<ApprovalsRepository['markFailedUndecided']>[2],
  ): Promise<ApprovalRecord | null> {
    const row = this.rows.find((r) => r.id === id && isOpen(r, d.now));
    if (!row) return null;
    row.failedAt = d.now.toISOString();
    row.resultSlug = slug;
    row.decidedVia = d.via;
    return { ...row };
  }

  async claimDecision(input: ClaimDecisionInput): Promise<ApprovalRecord | null> {
    const row = this.rows.find(
      (r) =>
        r.id === input.id &&
        r.subjectHash === input.subjectHash &&
        isOpen(r, input.now) &&
        (input.tokenHash === null ||
          r.linkTokenHash === input.tokenHash ||
          r.previousTokenHash === input.tokenHash) &&
        (input.ownerId === null || r.ownerId === input.ownerId),
    );
    if (!row) return null;
    if (input.decision === 'approve') row.approvedAt = input.now.toISOString();
    else row.deniedAt = input.now.toISOString();
    row.decidedVia = input.via;
    return { ...row };
  }

  async markCompleted(
    id: string,
    result: Readonly<Record<string, unknown>>,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const row = this.rows.find(
      (r) => r.id === id && r.approvedAt !== null && r.completedAt === null && r.failedAt === null,
    );
    if (!row) return null;
    row.completedAt = now.toISOString();
    row.result = result;
    return { ...row };
  }

  async markFailedAfterApprove(
    id: string,
    slug: string,
    now: Date,
  ): Promise<ApprovalRecord | null> {
    const row = this.rows.find(
      (r) => r.id === id && r.approvedAt !== null && r.completedAt === null && r.failedAt === null,
    );
    if (!row) return null;
    row.failedAt = now.toISOString();
    row.resultSlug = slug;
    return { ...row };
  }

  async applyOwnerEdit(
    input: OwnerEditInput,
  ): Promise<
    | { readonly outcome: 'remint'; readonly record: ApprovalRecord; readonly mailed: boolean }
    | { readonly outcome: 'not_open' }
  > {
    const row = this.rows.find(
      (r) =>
        r.id === input.id &&
        r.ownerId === input.ownerId &&
        r.subjectHash === input.expectSubjectHash &&
        isOpen(r, input.now),
    );
    if (!row) return { outcome: 'not_open' };
    Object.assign(row, {
      subjectHash: input.subjectHash,
      summary: input.summary,
      approveRequires: input.approveRequires,
      previousTokenHash: input.previousTokenHash,
      linkTokenHash: null,
      expiresAt: input.expiresAt,
      ownerEditedAt: input.now.toISOString(),
    });
    let mailed = false;
    if (input.email && this.mailsToday(input.ownerId, input.now) < input.maxMailsPerOwnerPerDay) {
      this.insertEmail(input.email({ ...row }, `approval_request:${row.id}:${row.subjectHash}`));
      mailed = true;
    }
    return { outcome: 'remint', record: { ...row }, mailed };
  }

  async list(
    ownerId: string,
    input: ListApprovalsInput,
  ): Promise<{ readonly items: readonly ApprovalRecord[]; readonly hasMore: boolean }> {
    const sorted = this.rows
      .filter((r) => r.ownerId === ownerId)
      .filter((r) => !input.status || approvalStatus(r, input.now).status === input.status)
      .sort((a, b) =>
        a.createdAt === b.createdAt
          ? b.id.localeCompare(a.id)
          : b.createdAt.localeCompare(a.createdAt),
      )
      .filter(
        (r) =>
          !input.cursor ||
          r.createdAt < input.cursor.createdAt ||
          (r.createdAt === input.cursor.createdAt && r.id < input.cursor.id),
      );
    return {
      items: sorted.slice(0, input.limit).map((r) => ({ ...r })),
      hasMore: sorted.length > input.limit,
    };
  }

  async countPending(ownerId: string, now: Date): Promise<number> {
    return this.rows.filter(
      (r) =>
        r.ownerId === ownerId && approvalStatus(r, now).status === ('pending' as ApprovalStatus),
    ).length;
  }

  async expireOpenForApiKey(apiKeyId: string, reason: string, now: Date): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.apiKeyId === apiKeyId && hasNoOutcome(r)) {
        r.expiredAt = now.toISOString();
        r.expiredReason = reason;
        n += 1;
      }
    }
    return n;
  }

  async expireOpenForOAuthGrant(oauthGrantId: string, reason: string, now: Date): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.oauthGrantId === oauthGrantId && hasNoOutcome(r)) {
        r.expiredAt = now.toISOString();
        r.expiredReason = reason;
        n += 1;
      }
    }
    return n;
  }

  async expireOpenForOwner(ownerId: string, reason: string, now: Date): Promise<number> {
    let n = 0;
    for (const r of this.rows) {
      if (r.ownerId === ownerId && hasNoOutcome(r)) {
        r.expiredAt = now.toISOString();
        r.expiredReason = reason;
        n += 1;
      }
    }
    return n;
  }

  async deleteAllForOwner(ownerId: string): Promise<number> {
    const before = this.rows.length;
    for (let i = this.rows.length - 1; i >= 0; i -= 1) {
      if (this.rows[i]?.ownerId === ownerId) this.rows.splice(i, 1);
    }
    return before - this.rows.length;
  }

  async countDenialsForKey(apiKeyId: string, since: Date): Promise<number> {
    return this.rows.filter(
      (r) =>
        r.apiKeyId === apiKeyId && r.deniedAt !== null && Date.parse(r.deniedAt) >= since.getTime(),
    ).length;
  }

  async countDenialsForGrant(oauthGrantId: string, since: Date): Promise<number> {
    return this.rows.filter(
      (r) =>
        r.oauthGrantId === oauthGrantId &&
        r.deniedAt !== null &&
        Date.parse(r.deniedAt) >= since.getTime(),
    ).length;
  }

  async countOutboundSince(): Promise<{ readonly day: number; readonly month: number }> {
    return this.outboundVolume;
  }

  async insertConfirmation(input: InsertConfirmationInput): Promise<void> {
    this.confirmations.push({ ...input, consumedAt: null });
  }

  async consumeConfirmation(input: ConsumeConfirmationInput): Promise<boolean> {
    const row = this.confirmations.find(
      (c) =>
        c.tokenHash === input.tokenHash &&
        c.envelopeId === input.envelopeId &&
        c.subjectHash === input.subjectHash &&
        c.consumedAt === null &&
        Date.parse(c.expiresAt) > input.now.getTime() &&
        (input.apiKeyId !== null
          ? c.apiKeyId === input.apiKeyId
          : c.oauthGrantId === input.oauthGrantId),
    );
    if (!row) return false;
    row.consumedAt = input.now.toISOString();
    return true;
  }
}
