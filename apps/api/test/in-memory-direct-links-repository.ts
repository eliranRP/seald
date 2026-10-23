import { randomUUID } from 'node:crypto';
import {
  DirectLinkExistsError,
  DirectLinksRepository,
  type CreateDirectLinkRow,
  type DirectLinkPatch,
  type DirectLinkRecord,
  type EnvelopeProvenance,
  type ReserveClaimResult,
} from '../src/direct-links/direct-links.repository';

interface StoredLink extends DirectLinkRecord {
  readonly token_hash: string;
  readonly revoked_at: Date | null;
}

interface StoredClaim {
  readonly id: string;
  readonly link_id: string;
  readonly email_hash: string;
  readonly created_at: Date;
  envelope_id: string | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Hermetic stand-in for `DirectLinksPgRepository`. */
export class InMemoryDirectLinksRepository extends DirectLinksRepository {
  private links: StoredLink[] = [];
  private claims: StoredClaim[] = [];
  /** envelope id → provenance, so e2e can assert what the pg adapter stamps. */
  readonly provenance = new Map<string, EnvelopeProvenance>();

  reset(): void {
    this.links = [];
    this.claims = [];
    this.provenance.clear();
  }

  claimCount(): number {
    return this.claims.length;
  }

  /** Move every claim into the past (tests of the rolling 24 hour window). */
  ageClaims(ms: number): void {
    this.claims = this.claims.map((c) => ({
      ...c,
      created_at: new Date(c.created_at.getTime() - ms),
    }));
  }

  private strip(l: StoredLink): DirectLinkRecord {
    const { token_hash: _t, revoked_at: _r, ...rest } = l;
    return rest;
  }

  async findLiveByTemplate(
    owner_id: string,
    template_id: string,
  ): Promise<DirectLinkRecord | null> {
    const l = this.links.find(
      (x) => x.owner_id === owner_id && x.template_id === template_id && x.revoked_at === null,
    );
    return l ? this.strip(l) : null;
  }

  async findLiveByTokenHash(token_hash: string): Promise<DirectLinkRecord | null> {
    const l = this.links.find((x) => x.token_hash === token_hash && x.revoked_at === null);
    return l ? this.strip(l) : null;
  }

  async create(input: CreateDirectLinkRow): Promise<DirectLinkRecord> {
    if (this.links.some((x) => x.template_id === input.template_id && x.revoked_at === null)) {
      throw new DirectLinkExistsError();
    }
    const now = new Date();
    const row: StoredLink = {
      id: randomUUID(),
      template_id: input.template_id,
      owner_id: input.owner_id,
      prefix: input.prefix,
      signer_slot: input.signer_slot,
      enabled: true,
      daily_cap: input.daily_cap,
      sender_name: input.sender_name,
      sender_email: input.sender_email,
      created_at: now,
      updated_at: now,
      token_hash: input.token_hash,
      revoked_at: null,
    };
    this.links.push(row);
    return this.strip(row);
  }

  async update(
    owner_id: string,
    template_id: string,
    patch: DirectLinkPatch,
  ): Promise<DirectLinkRecord | null> {
    const i = this.links.findIndex(
      (x) => x.owner_id === owner_id && x.template_id === template_id && x.revoked_at === null,
    );
    const cur = this.links[i];
    if (i < 0 || !cur) return null;
    const next: StoredLink = { ...cur, ...patch, updated_at: new Date() };
    this.links[i] = next;
    return this.strip(next);
  }

  async rotate(
    owner_id: string,
    template_id: string,
    next: {
      readonly token_hash: string;
      readonly prefix: string;
      readonly sender_email: string | null;
    },
  ): Promise<DirectLinkRecord | null> {
    const i = this.links.findIndex(
      (x) => x.owner_id === owner_id && x.template_id === template_id && x.revoked_at === null,
    );
    const old = this.links[i];
    if (i < 0 || !old) return null;
    this.links[i] = { ...old, revoked_at: new Date() };
    const now = new Date();
    const row: StoredLink = {
      ...old,
      id: randomUUID(),
      token_hash: next.token_hash,
      prefix: next.prefix,
      sender_email: next.sender_email ?? old.sender_email,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    };
    this.links.push(row);
    return this.strip(row);
  }

  async revoke(owner_id: string, template_id: string): Promise<boolean> {
    const i = this.links.findIndex(
      (x) => x.owner_id === owner_id && x.template_id === template_id && x.revoked_at === null,
    );
    const cur = this.links[i];
    if (i < 0 || !cur) return false;
    this.links[i] = { ...cur, enabled: false, revoked_at: new Date() };
    return true;
  }

  async countRecentClaims(link_id: string, now: Date): Promise<number> {
    const since = now.getTime() - DAY_MS;
    return this.claims.filter((c) => c.link_id === link_id && c.created_at.getTime() > since)
      .length;
  }

  async reserveClaim(input: {
    readonly link_id: string;
    readonly email_hash: string;
    readonly daily_cap: number;
    readonly now: Date;
  }): Promise<ReserveClaimResult> {
    const since = input.now.getTime() - DAY_MS;
    const recent = this.claims.filter(
      (c) => c.link_id === input.link_id && c.created_at.getTime() > since,
    );
    if (recent.some((c) => c.email_hash === input.email_hash)) return { kind: 'duplicate' };
    if (recent.length >= input.daily_cap) return { kind: 'cap_reached' };
    const claim: StoredClaim = {
      id: randomUUID(),
      link_id: input.link_id,
      email_hash: input.email_hash,
      created_at: input.now,
      envelope_id: null,
    };
    this.claims.push(claim);
    return { kind: 'reserved', claim_id: claim.id };
  }

  async releaseClaim(claim_id: string): Promise<void> {
    this.claims = this.claims.filter((c) => c.id !== claim_id);
  }

  async attachEnvelope(claim_id: string, p: EnvelopeProvenance): Promise<void> {
    const c = this.claims.find((x) => x.id === claim_id);
    if (c) c.envelope_id = p.envelope_id;
    this.provenance.set(p.envelope_id, p);
  }
}
