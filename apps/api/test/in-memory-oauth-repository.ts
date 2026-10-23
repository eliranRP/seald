import { randomUUID } from 'node:crypto';
import type { ApprovalKeyFacts } from '../src/approvals/approvals.repository';
import { connectedAppLabel } from '../src/mcp/oauth/connected-app-label';
import {
  OAuthRepository,
  type ConsumeCodeResult,
  type InsertCodeInput,
  type IssueTokensInput,
  type OAuthAccessRecord,
  type OAuthClientRecord,
  type OAuthCodeRecord,
  type OAuthGrantRecord,
  type OAuthRefreshRecord,
  type UpsertClientInput,
} from '../src/mcp/oauth/oauth.repository';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface StoredGrant {
  id: string;
  ownerId: string;
  clientRef: string;
  scopes: string[];
  requireOwnerApproval: boolean;
  allowNewRecipients: boolean;
  alwaysRequireSignin: boolean;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: string | null;
}

interface StoredAccess {
  id: string;
  tokenHash: string;
  grantId: string;
  familyId: string;
  scopes: string[];
  resource: string;
  expiresAt: string;
  revokedAt: string | null;
}

/**
 * In-memory `OAuthRepository` for unit specs and in-memory e2e boots.
 * Each method runs to completion without awaiting in between, so it is
 * atomic in one event loop, like the Postgres adapter's conditional
 * updates and transactions.
 */
export class InMemoryOAuthRepository extends OAuthRepository {
  readonly clients: Mutable<OAuthClientRecord>[] = [];
  readonly grants: StoredGrant[] = [];
  readonly codes: (Mutable<OAuthCodeRecord> & { codeHash: string })[] = [];
  readonly refresh: (Mutable<OAuthRefreshRecord> & { tokenHash: string })[] = [];
  readonly access: StoredAccess[] = [];

  async upsertClient(input: UpsertClientInput): Promise<OAuthClientRecord> {
    const existing = this.clients.find((c) => c.clientId === input.clientId);
    if (existing) {
      existing.kind = input.kind;
      existing.clientName = input.clientName;
      existing.redirectUris = [...input.redirectUris];
      return { ...existing };
    }
    const row = {
      id: randomUUID(),
      clientId: input.clientId,
      kind: input.kind,
      clientName: input.clientName,
      redirectUris: [...input.redirectUris],
    };
    this.clients.push(row);
    return { ...row };
  }

  async upsertGrant(input: {
    readonly ownerId: string;
    readonly clientRef: string;
    readonly scopes: readonly string[];
    readonly now: Date;
  }): Promise<OAuthGrantRecord> {
    let g = this.grants.find(
      (x) => x.ownerId === input.ownerId && x.clientRef === input.clientRef && x.revokedAt === null,
    );
    if (g) {
      g.scopes = [...input.scopes];
    } else {
      g = {
        id: randomUUID(),
        ownerId: input.ownerId,
        clientRef: input.clientRef,
        scopes: [...input.scopes],
        requireOwnerApproval: true,
        allowNewRecipients: false,
        alwaysRequireSignin: false,
        createdAt: input.now.toISOString(),
        lastUsedAt: null,
        revokedAt: null,
        revokedReason: null,
      };
      this.grants.push(g);
    }
    return this.toGrant(g);
  }

  async insertCode(input: InsertCodeInput): Promise<void> {
    this.codes.push({
      id: randomUUID(),
      codeHash: input.codeHash,
      grantId: input.grantId,
      ownerId: input.ownerId,
      clientRef: input.clientRef,
      redirectUri: input.redirectUri,
      codeChallenge: input.codeChallenge,
      resource: input.resource,
      scopes: [...input.scopes],
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
  }

  async consumeCode(codeHash: string, now: Date): Promise<ConsumeCodeResult> {
    const c = this.codes.find((x) => x.codeHash === codeHash);
    if (!c) return { outcome: 'invalid' };
    if (c.consumedAt !== null) return { outcome: 'replayed', code: { ...c } };
    if (Date.parse(c.expiresAt) <= now.getTime()) return { outcome: 'invalid' };
    c.consumedAt = now.toISOString();
    return { outcome: 'consumed', code: { ...c } };
  }

  async findGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const g = this.grants.find((x) => x.id === grantId);
    return g ? this.toGrant(g) : null;
  }

  async issueTokens(input: IssueTokensInput): Promise<void> {
    this.write(input);
  }

  async findRefreshToken(tokenHash: string): Promise<OAuthRefreshRecord | null> {
    const r = this.refresh.find((x) => x.tokenHash === tokenHash);
    return r ? { ...r } : null;
  }

  async rotateRefreshToken(
    oldId: string,
    next: IssueTokensInput,
    now: Date,
  ): Promise<'rotated' | 'reused'> {
    const r = this.refresh.find((x) => x.id === oldId);
    if (!r || r.rotatedAt !== null || r.revokedAt !== null) return 'reused';
    r.rotatedAt = now.toISOString();
    this.write(next);
    return 'rotated';
  }

  async findAccessToken(tokenHash: string): Promise<OAuthAccessRecord | null> {
    const a = this.access.find((x) => x.tokenHash === tokenHash);
    if (!a) return null;
    const grant = await this.findGrant(a.grantId);
    if (!grant) return null;
    return {
      id: a.id,
      grant,
      familyId: a.familyId,
      scopes: [...a.scopes],
      resource: a.resource,
      expiresAt: a.expiresAt,
      revokedAt: a.revokedAt,
    };
  }

  async revokeGrant(grantId: string, reason: string, now: Date): Promise<boolean> {
    const at = now.toISOString();
    const g = this.grants.find((x) => x.id === grantId);
    const changed = g !== undefined && g.revokedAt === null;
    if (g && changed) {
      g.revokedAt = at;
      g.revokedReason = reason;
    }
    for (const r of this.refresh)
      if (r.grantId === grantId && r.revokedAt === null) r.revokedAt = at;
    for (const a of this.access)
      if (a.grantId === grantId && a.revokedAt === null) a.revokedAt = at;
    return changed;
  }

  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const at = now.toISOString();
    let n = 0;
    for (const r of this.refresh) {
      if (r.familyId === familyId && r.revokedAt === null) {
        r.revokedAt = at;
        n += 1;
      }
    }
    for (const a of this.access) {
      if (a.familyId === familyId && a.revokedAt === null) {
        a.revokedAt = at;
        n += 1;
      }
    }
    return n;
  }

  async revokeAccessToken(tokenHash: string, now: Date): Promise<boolean> {
    const a = this.access.find((x) => x.tokenHash === tokenHash && x.revokedAt === null);
    if (!a) return false;
    a.revokedAt = now.toISOString();
    return true;
  }

  async touchGrantLastUsed(grantId: string, now: Date): Promise<void> {
    const g = this.grants.find((x) => x.id === grantId);
    if (g) g.lastUsedAt = now.toISOString();
  }

  async listLiveGrants(ownerId: string): Promise<readonly OAuthGrantRecord[]> {
    return this.grants
      .filter((g) => g.ownerId === ownerId && g.revokedAt === null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((g) => this.toGrant(g));
  }

  /** The approvals side of a grant, for `InMemoryApprovalsRepository.grantSource`. */
  async grantFacts(id: string): Promise<ApprovalKeyFacts | null> {
    const g = this.grants.find((x) => x.id === id);
    if (!g) return null;
    const c = this.client(g.clientRef);
    return {
      credential: 'oauth',
      oauthClientId: c.id,
      id: g.id,
      ownerId: g.ownerId,
      name: connectedAppLabel(c.kind, c.clientId, c.clientName),
      prefix: '',
      revokedAt: g.revokedAt,
      expiresAt: '9999-12-31T00:00:00.000Z',
      alwaysRequireSignin: g.alwaysRequireSignin,
      allowNewRecipients: g.allowNewRecipients,
      approvalNotify: 'email',
    };
  }

  private write(input: IssueTokensInput): void {
    this.access.push({
      id: randomUUID(),
      tokenHash: input.accessHash,
      grantId: input.grantId,
      familyId: input.familyId,
      scopes: [...input.scopes],
      resource: input.resource,
      expiresAt: input.accessExpiresAt,
      revokedAt: null,
    });
    this.refresh.push({
      id: randomUUID(),
      tokenHash: input.refreshHash,
      grantId: input.grantId,
      familyId: input.familyId,
      clientRef: input.clientRef,
      scopes: [...input.scopes],
      resource: input.resource,
      absoluteExpiresAt: input.refreshAbsoluteExpiresAt,
      idleExpiresAt: input.refreshIdleExpiresAt,
      rotatedAt: null,
      revokedAt: null,
    });
  }

  private client(id: string): OAuthClientRecord {
    const c = this.clients.find((x) => x.id === id);
    if (!c) throw new Error(`unknown oauth client ${id}`);
    return c;
  }

  private toGrant(g: StoredGrant): OAuthGrantRecord {
    return {
      id: g.id,
      ownerId: g.ownerId,
      client: { ...this.client(g.clientRef) },
      scopes: [...g.scopes],
      requireOwnerApproval: g.requireOwnerApproval,
      allowNewRecipients: g.allowNewRecipients,
      alwaysRequireSignin: g.alwaysRequireSignin,
      createdAt: g.createdAt,
      lastUsedAt: g.lastUsedAt,
      revokedAt: g.revokedAt,
    };
  }
}
