import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { GDriveKmsService } from './gdrive-kms.service';
import { GDRIVE_REPOSITORY, type GDriveAccount, type GDriveRepository } from './gdrive.repository';
import { TokenExpiredError } from './dto/error-codes';

/**
 * Adapter over the Google OAuth + token-refresh endpoints. Kept behind a
 * small port so the unit suite can stub the network without touching
 * real Google. The production adapter lives next to this file and uses
 * `googleapis` / `google-auth-library`.
 */
export interface GoogleOAuthClient {
  exchangeCode(
    code: string,
    codeVerifier: string,
  ): Promise<{
    refreshToken: string;
    accessToken: string;
    expiresAt: number;
    googleUserId: string;
    googleEmail: string;
    scope: string;
  }>;
  refreshAccessToken(
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<{ accessToken: string; expiresAt: number }>;
  revokeToken(refreshToken: string): Promise<void>;
}

export const GOOGLE_OAUTH_CLIENT = Symbol('GOOGLE_OAUTH_CLIENT');

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/**
 * Token issuer for internal callers (the Drive files proxy + the WT-D
 * conversion service). Holds a per-account in-flight Promise so 5
 * concurrent callers collapse onto a single Google refresh request
 * (Phase 4 watchpoint #3 — request-scoped AbortSignal honored).
 */
@Injectable()
export class GDriveService {
  private readonly cache = new Map<string, CachedToken>();
  private readonly inflight = new Map<string, Promise<CachedToken>>();

  constructor(
    @Inject(GDRIVE_REPOSITORY) private readonly repo: GDriveRepository,
    private readonly kms: GDriveKmsService,
    @Inject(GOOGLE_OAUTH_CLIENT) private readonly google: GoogleOAuthClient,
  ) {}

  async getAccessToken(
    accountId: string,
    userId: string,
    signal?: AbortSignal,
  ): Promise<{ accessToken: string; expiresAt: number }> {
    const account = await this.requireOwnedAccount(accountId, userId);
    const cached = this.cache.get(accountId);
    // 30s skew guard — refresh slightly early so callers don't trip Google's
    // own 5xx-on-expiry race.
    if (cached && cached.expiresAt - Date.now() > 30_000) {
      return cached;
    }
    const existing = this.inflight.get(accountId);
    if (existing) return existing;
    const promise = this.refreshToken(account, signal);
    this.inflight.set(accountId, promise);
    try {
      const next = await promise;
      this.cache.set(accountId, next);
      return next;
    } finally {
      this.inflight.delete(accountId);
    }
  }

  private async refreshToken(account: GDriveAccount, signal?: AbortSignal): Promise<CachedToken> {
    const refreshToken = await this.kms.decrypt(
      account.refreshTokenCiphertext,
      account.refreshTokenKmsKeyArn,
    );
    try {
      const out = await this.google.refreshAccessToken(refreshToken, signal);
      await this.repo.touchLastUsed(account.id);
      return out;
    } catch (err) {
      if (isInvalidGrant(err)) {
        throw new TokenExpiredError('refresh_token_invalid_or_revoked');
      }
      throw err;
    }
  }

  async listAccounts(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    return this.repo.listForUser(userId);
  }

  /**
   * Completes the OAuth dance: exchanges `code` for tokens, encrypts the
   * refresh token via KMS envelope, and persists a `gdrive_accounts` row
   * owned by `userId`. Returns the row id.
   *
   * Idempotent on (userId, googleUserId): if an active row already exists
   * for that pair, rotate its token in place and return its id. Without
   * this short-circuit, the partial UNIQUE index
   * `gdrive_accounts_user_google_uniq` (migration 0013) fires a Postgres
   * 23505 on the second connect and the popup surfaces `internal_error`
   * (Bug H, Phase 6.A iter-2 PROD, 2026-05-04).
   */
  async completeOAuth(args: {
    userId: string;
    code: string;
    codeVerifier: string;
  }): Promise<string> {
    const exchange = await this.google.exchangeCode(args.code, args.codeVerifier);
    const enc = await this.kms.encrypt(exchange.refreshToken);
    const existing = await this.repo.findActiveByUserAndGoogleUser(
      args.userId,
      exchange.googleUserId,
    );
    if (existing) {
      await this.repo.replaceToken({
        id: existing.id,
        refreshTokenCiphertext: enc.ciphertext,
        refreshTokenKmsKeyArn: enc.kmsKeyArn,
        scope: exchange.scope,
        googleEmail: exchange.googleEmail,
      });
      // Drop any cached access token tied to the old refresh token so the
      // next getAccessToken() pulls a fresh one.
      this.cache.delete(existing.id);
      return existing.id;
    }
    const id = newUuid();
    await this.repo.insert({
      id,
      userId: args.userId,
      googleUserId: exchange.googleUserId,
      googleEmail: exchange.googleEmail,
      refreshTokenCiphertext: enc.ciphertext,
      refreshTokenKmsKeyArn: enc.kmsKeyArn,
      scope: exchange.scope,
      connectedAt: new Date().toISOString(),
      lastUsedAt: null,
      deletedAt: null,
    });
    return id;
  }

  async revokeAccount(accountId: string, userId: string): Promise<void> {
    const account = await this.requireOwnedAccount(accountId, userId);
    const refreshToken = await this.kms.decrypt(
      account.refreshTokenCiphertext,
      account.refreshTokenKmsKeyArn,
    );
    // Best-effort revoke at Google. If it fails, still soft-delete locally
    // so the user isn't stuck — the row carries `deleted_at` for audit and
    // future GDPR requests.
    await this.google.revokeToken(refreshToken).catch(() => undefined);
    await this.repo.softDelete(accountId, userId);
    this.cache.delete(accountId);
  }

  private async requireOwnedAccount(id: string, userId: string): Promise<GDriveAccount> {
    const acc = await this.repo.findByIdForUser(id, userId);
    if (!acc || acc.deletedAt) throw new NotFoundException('gdrive_account_not_found');
    return acc;
  }
}

function newUuid(): string {
  return randomUUID();
}

function isInvalidGrant(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; message?: string };
  return e.code === 'invalid_grant' || /invalid_grant/i.test(e.message ?? '');
}
