import {
  EmailCopyRepository,
  type ConsumeStopResult,
  type EmailCopyContext,
  type ReserveSendsResult,
} from '../email-copy.repository';

/**
 * In-memory stand-in for `EmailCopyPgRepository` (unit and in-memory e2e
 * specs). Mirrors the semantics the Postgres adapter guarantees: all or
 * nothing reservation, retries of the same run free, single-use tokens.
 */
export class FakeEmailCopyRepo extends EmailCopyRepository {
  context: EmailCopyContext | null = {
    envelope: {
      id: 'env-1',
      title: 'Lease',
      status: 'completed',
      shortCode: 'AB12CD34EF56G',
      senderEmail: 'owner@example.com',
      senderName: 'Olive Owner',
    },
    signerName: null,
  };
  readonly suppressions = new Set<string>();
  readonly sends: { run_id: string; email: string; owner_id: string; day: string }[] = [];
  readonly tokens = new Map<string, { ownerId: string; email: string; used: boolean }>();
  /** Recipes the stop link prunes: `owner|automationId` -> addresses. */
  readonly recipes = new Map<string, { ownerId: string; to: string[]; enabled: boolean }>();

  async loadContext(): Promise<EmailCopyContext | null> {
    return this.context;
  }

  async suppressedAmong(ownerId: string, emails: readonly string[]): Promise<ReadonlySet<string>> {
    return new Set(emails.filter((e) => this.suppressions.has(`${ownerId}|${e}`)));
  }

  async reserveSends(input: {
    readonly ownerId: string;
    readonly runId: string;
    readonly emails: readonly string[];
    readonly day: string;
    readonly cap: number;
  }): Promise<ReserveSendsResult> {
    const have = new Set(this.sends.filter((s) => s.run_id === input.runId).map((s) => s.email));
    const fresh = input.emails.filter((e) => !have.has(e));
    const used = this.sends.filter((s) => s.owner_id === input.ownerId && s.day === input.day);
    if (used.length + fresh.length > input.cap) return 'capped';
    for (const email of fresh) {
      this.sends.push({ run_id: input.runId, email, owner_id: input.ownerId, day: input.day });
    }
    return 'reserved';
  }

  async isSuppressed(ownerId: string, email: string): Promise<boolean> {
    return this.suppressions.has(`${ownerId}|${email}`);
  }

  async putStopToken(input: {
    readonly tokenHash: string;
    readonly ownerId: string;
    readonly email: string;
  }): Promise<void> {
    this.tokens.set(input.tokenHash, { ownerId: input.ownerId, email: input.email, used: false });
  }

  async peekStopToken(tokenHash: string): Promise<{ readonly email: string } | null> {
    const t = this.tokens.get(tokenHash);
    return t && !t.used ? { email: t.email } : null;
  }

  async consumeStopToken(tokenHash: string): Promise<ConsumeStopResult> {
    const t = this.tokens.get(tokenHash);
    if (!t || t.used) return { kind: 'invalid' };
    t.used = true;
    this.suppressions.add(`${t.ownerId}|${t.email}`);
    for (const recipe of this.recipes.values()) {
      if (recipe.ownerId !== t.ownerId) continue;
      const kept = recipe.to.filter((a) => a !== t.email);
      if (kept.length === recipe.to.length) continue;
      recipe.to = kept;
      if (kept.length === 0) recipe.enabled = false;
    }
    return { kind: 'stopped', email: t.email };
  }
}
