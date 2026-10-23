/**
 * Port for the OAuth tables (migration 0036). Every state change that can
 * race (code consumption, refresh rotation, revocation) is a single
 * conditional statement or one transaction, so concurrent callers
 * resolve to one winner.
 */

export interface OAuthClientRecord {
  readonly id: string;
  readonly clientId: string;
  readonly kind: 'preregistered' | 'cimd';
  readonly clientName: string;
  readonly redirectUris: readonly string[];
}

export interface OAuthGrantRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly client: OAuthClientRecord;
  readonly scopes: readonly string[];
  readonly requireOwnerApproval: boolean;
  readonly allowNewRecipients: boolean;
  readonly alwaysRequireSignin: boolean;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly revokedAt: string | null;
}

export interface OAuthCodeRecord {
  readonly id: string;
  readonly grantId: string;
  readonly ownerId: string;
  readonly clientRef: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
  readonly consumedAt: string | null;
}

export interface OAuthRefreshRecord {
  readonly id: string;
  readonly grantId: string;
  readonly familyId: string;
  readonly clientRef: string;
  readonly scopes: readonly string[];
  readonly resource: string;
  readonly absoluteExpiresAt: string;
  readonly idleExpiresAt: string;
  readonly rotatedAt: string | null;
  readonly revokedAt: string | null;
}

export interface OAuthAccessRecord {
  readonly id: string;
  readonly grant: OAuthGrantRecord;
  readonly familyId: string;
  readonly scopes: readonly string[];
  readonly resource: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface UpsertClientInput {
  readonly clientId: string;
  readonly kind: 'preregistered' | 'cimd';
  readonly clientName: string;
  readonly redirectUris: readonly string[];
  readonly now: Date;
}

export interface InsertCodeInput {
  readonly codeHash: string;
  readonly grantId: string;
  readonly ownerId: string;
  readonly clientRef: string;
  readonly redirectUri: string;
  readonly codeChallenge: string;
  readonly resource: string;
  readonly scopes: readonly string[];
  readonly expiresAt: string;
}

/** A new access token and refresh token, written together. */
export interface IssueTokensInput {
  readonly grantId: string;
  readonly familyId: string;
  readonly clientRef: string;
  readonly scopes: readonly string[];
  readonly resource: string;
  readonly accessHash: string;
  readonly accessExpiresAt: string;
  readonly refreshHash: string;
  readonly refreshAbsoluteExpiresAt: string;
  readonly refreshIdleExpiresAt: string;
}

export type ConsumeCodeResult =
  | { readonly outcome: 'consumed'; readonly code: OAuthCodeRecord }
  /** Second use of a code: the tokens it produced are revoked. */
  | { readonly outcome: 'replayed'; readonly code: OAuthCodeRecord }
  | { readonly outcome: 'invalid' };

export abstract class OAuthRepository {
  /** Insert or refresh the snapshot for one client id. Returns `oauth_clients.id`. */
  abstract upsertClient(input: UpsertClientInput): Promise<OAuthClientRecord>;

  /**
   * One live grant per owner and client: a new consent replaces the
   * scopes of the live grant, or creates it. The owner settings keep
   * their values (defaults on create).
   */
  abstract upsertGrant(input: {
    readonly ownerId: string;
    readonly clientRef: string;
    readonly scopes: readonly string[];
    readonly now: Date;
  }): Promise<OAuthGrantRecord>;

  abstract insertCode(input: InsertCodeInput): Promise<void>;

  /** Single use: marks the code consumed only if unused and unexpired. */
  abstract consumeCode(codeHash: string, now: Date): Promise<ConsumeCodeResult>;

  abstract findGrant(grantId: string): Promise<OAuthGrantRecord | null>;

  abstract issueTokens(input: IssueTokensInput): Promise<void>;

  abstract findRefreshToken(tokenHash: string): Promise<OAuthRefreshRecord | null>;

  /**
   * Rotation in one transaction: mark `oldId` rotated (only if it is not
   * rotated or revoked yet), then write the new pair. `reused` means the
   * old token was already rotated or revoked; nothing new was written.
   */
  abstract rotateRefreshToken(
    oldId: string,
    next: IssueTokensInput,
    now: Date,
  ): Promise<'rotated' | 'reused'>;

  abstract findAccessToken(tokenHash: string): Promise<OAuthAccessRecord | null>;

  /** Revoke one grant and every token it issued. False when already revoked or unknown. */
  abstract revokeGrant(grantId: string, reason: string, now: Date): Promise<boolean>;

  /** Revoke every refresh and access token of one family (one consent's chain). */
  abstract revokeFamily(familyId: string, now: Date): Promise<number>;

  abstract revokeAccessToken(tokenHash: string, now: Date): Promise<boolean>;

  abstract touchGrantLastUsed(grantId: string, now: Date): Promise<void>;

  /** Live grants of an owner, newest first (connected apps). */
  abstract listLiveGrants(ownerId: string): Promise<readonly OAuthGrantRecord[]>;
}
