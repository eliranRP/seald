import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  API_KEY_DEFAULT_SCOPES,
  API_KEY_DEFAULT_TTL_DAYS,
  API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
  API_KEY_MAX_LIVE,
  API_KEY_MAX_TTL_DAYS,
  CreateApiKeyRequestSchema,
  isApiKeyScope,
  requiresFreshLogin,
  type ApiKey,
  type ApiKeyListResponse,
  type ApiKeyScope,
  type CreateApiKeyResponse,
  type RevokeApiKeyResponse,
} from 'shared';
import { ApprovalsLifecycleService } from '../approvals/approvals-lifecycle.service';
import type { AuthUser } from '../auth/auth-user';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { InsertOutboundEmailInput } from '../email/outbound-emails.repository';
import { generateApiKey } from './api-key-secret';
import { ApiKeysRepository, type ApiKeyRecord } from './api-keys.repository';

/** WP-45: the row shape the MCP key tools read through this service (src/mcp may not import a repository). */
export type { ApiKeyRecord };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Client clocks drift; a 365-day choice computed client-side must pass. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000;
/** `amr` timestamps a little in the future are clock skew, more is bogus. */
const AMR_FUTURE_SKEW_SECONDS = 60;
const PREFIX_ATTEMPTS = 3;

/**
 * Session-side key management (`/me/api-keys`). Rules from
 * docs/design/mcp-server.md § API keys and § Settings UI:
 *
 * - Guest / anonymous sessions (no email) cannot create keys.
 * - `{}` creates `Key N`, scope `envelopes:read`, expiry 90 days.
 * - `expires_at`, when sent, must be in the future and at most 365 days
 *   out; null is `validation_error` (there is no "never").
 * - A key with `envelopes:send` (or a WP-45 admin / sign scope) needs a
 *   fresh sign-in: newest `amr[].timestamp` within 10 minutes. `iat` is
 *   not the check.
 * - At most 10 live keys, enforced under an advisory lock in the repo.
 * - The owner is emailed (key name and prefix, never the secret) in the
 *   same transaction as the insert.
 * - Revocation keeps the row.
 *
 * The full secret is returned once, in the create response, and is never
 * logged.
 */
@Injectable()
export class ApiKeysService {
  private readonly log = new Logger(ApiKeysService.name);
  private readonly publicUrl: string;

  constructor(
    private readonly repo: ApiKeysRepository,
    @Inject(APP_ENV) env: AppEnv,
    // WP-21: revoking a key expires its pending approvals. Optional so
    // unit specs that build the service by hand keep working.
    @Optional() private readonly approvals?: ApprovalsLifecycleService,
  ) {
    this.publicUrl = env.APP_PUBLIC_URL.replace(/\/$/, '');
  }

  async list(user: AuthUser, now: Date = new Date()): Promise<ApiKeyListResponse> {
    const rows = await this.repo.listLive(user.id);
    return { items: rows.map((row) => toWire(row, now)) };
  }

  async create(
    user: AuthUser,
    body: unknown,
    now: Date = new Date(),
  ): Promise<CreateApiKeyResponse> {
    if (!user.email) throw new ForbiddenException('email_required');

    const parsed = CreateApiKeyRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    const req = parsed.data;

    const scopes = dedupe(req.scopes ?? API_KEY_DEFAULT_SCOPES);
    const expiresAt = resolveExpiry(req.expires_at, now);

    if (requiresFreshLogin(scopes) && !isFreshLogin(user.lastSignInAt ?? null, now)) {
      throw new ForbiddenException('fresh_login_required');
    }

    return this.mint({
      ownerId: user.id,
      ownerEmail: user.email,
      name: req.name ?? null,
      scopes,
      expiresAt,
      alwaysRequireSignin: req.always_require_signin ?? false,
      now,
    });
  }

  /**
   * WP-45 `api_key_create`, after the owner approved on the approval page
   * with a sign-in from the last 10 minutes (the same freshness `create`
   * asks for an elevated scope). The scope ceiling (never wider than the
   * key that asked) is the approval kind's to check. The secret goes back
   * to the approval page once; the owner is emailed as for any key.
   */
  async createOnApproval(input: {
    readonly ownerId: string;
    readonly ownerEmail: string;
    readonly name: string | null;
    readonly scopes: readonly ApiKeyScope[];
    readonly expiresInDays: number;
    readonly now: Date;
  }): Promise<CreateApiKeyResponse> {
    const days = Math.min(Math.max(input.expiresInDays, 1), API_KEY_MAX_TTL_DAYS);
    return this.mint({
      ownerId: input.ownerId,
      ownerEmail: input.ownerEmail,
      name: input.name,
      scopes: dedupe(input.scopes),
      expiresAt: new Date(input.now.getTime() + days * DAY_MS),
      alwaysRequireSignin: false,
      now: input.now,
    });
  }

  /** WP-45: the owner's keys (live and expired), for `api_keys_list` and the ceiling check. */
  listForOwner(ownerId: string): Promise<readonly ApiKeyRecord[]> {
    return this.repo.listLive(ownerId);
  }

  /** WP-45: one of the owner's keys in any state, or null. */
  findOwned(ownerId: string, id: string): Promise<ApiKeyRecord | null> {
    return this.repo.findOwned(ownerId, id);
  }

  /**
   * WP-45 `approvals_set_required`. `true` applies at once from the tool;
   * `false` only from the approved `approval_required_toggle`.
   */
  async setRequireOwnerApproval(
    ownerId: string,
    id: string,
    value: boolean,
  ): Promise<ApiKeyRecord> {
    const row = await this.repo.setRequireOwnerApproval(ownerId, id, value);
    if (!row) throw new NotFoundException('api_key_not_found');
    this.log.log(`api key require_owner_approval=${String(value)} id=${id} owner=${ownerId}`);
    return row;
  }

  private async mint(input: {
    readonly ownerId: string;
    readonly ownerEmail: string;
    readonly name: string | null;
    readonly scopes: readonly ApiKeyScope[];
    readonly expiresAt: Date;
    readonly alwaysRequireSignin: boolean;
    readonly now: Date;
  }): Promise<CreateApiKeyResponse> {
    const { ownerId, ownerEmail, now } = input;
    for (let attempt = 0; attempt < PREFIX_ATTEMPTS; attempt += 1) {
      const generated = generateApiKey();
      const result = await this.repo.createWithinCap({
        ownerId,
        name: input.name,
        prefix: generated.prefix,
        keyHash: generated.keyHash,
        scopes: input.scopes,
        expiresAt: input.expiresAt.toISOString(),
        alwaysRequireSignin: input.alwaysRequireSignin,
        cap: API_KEY_MAX_LIVE,
        notification: (key) => this.creationEmail(ownerEmail, key),
      });
      if (result.ok) {
        this.log.log(
          `api key created id=${result.key.id} prefix=${result.key.prefix} owner=${ownerId}`,
        );
        return { key: toWire(result.key, now), secret: generated.token };
      }
      if (result.reason === 'cap_reached') throw new ConflictException('api_key_limit_reached');
      if (result.reason === 'name_taken') throw new ConflictException('api_key_name_taken');
      // prefix_taken: 48 random bits collided. Mint a fresh key and retry.
    }
    throw new ConflictException('api_key_prefix_collision');
  }

  revoke(user: AuthUser, id: string, now: Date = new Date()): Promise<RevokeApiKeyResponse> {
    return this.revokeForOwner(user.id, id, now);
  }

  /** `POST /me/api-keys/:id/revoke`, and the approved `api_key_revoke` (WP-45). */
  async revokeForOwner(
    ownerId: string,
    id: string,
    now: Date = new Date(),
  ): Promise<RevokeApiKeyResponse> {
    const result = await this.repo.revoke(ownerId, id, now);
    if (result === 'not_found') throw new NotFoundException('api_key_not_found');
    if (result === 'revoked') {
      this.log.log(`api key revoked id=${id} owner=${ownerId}`);
      // Revoking also expires that key's pending approvals (WP-21). Run on
      // a repeat revoke too, so a failed first pass is retried. A failure
      // here does not undo the revoke: an Approve still finds the key
      // revoked at decision time, records Failed and sends nothing.
    }
    if (this.approvals) {
      try {
        await this.approvals.expireForRevokedKey(id, now);
      } catch (err) {
        this.log.error(
          `approvals not expired on revoke key=${id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return { revoked: true };
  }

  /** Account deletion (`MeService.deleteAccount`). */
  deleteAllForOwner(ownerId: string): Promise<number> {
    return this.repo.deleteAllByOwner(ownerId);
  }

  private creationEmail(ownerEmail: string, key: ApiKeyRecord): InsertOutboundEmailInput {
    return {
      kind: 'api_key_created',
      to_email: ownerEmail,
      to_name: '',
      dedupe_key: `api_key_created:${key.id}`,
      payload: {
        key_name: key.name,
        key_prefix: key.prefix,
        scopes_readable: key.scopes.join(', '),
        created_at_readable: formatUtc(key.createdAt),
        expires_at_readable: key.expiresAt ? formatUtc(key.expiresAt) : '',
        settings_url: `${this.publicUrl}/settings/developers`,
        public_url: this.publicUrl,
      },
    };
  }
}

export function toWire(row: ApiKeyRecord, now: Date): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes.filter(isApiKeyScope),
    status: statusOf(row, now),
    require_owner_approval: row.requireOwnerApproval,
    allow_new_recipients: row.allowNewRecipients,
    always_require_signin: row.alwaysRequireSignin,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    expires_at: row.expiresAt,
    revoked_at: row.revokedAt,
  };
}

function statusOf(row: ApiKeyRecord, now: Date): ApiKey['status'] {
  if (row.revokedAt !== null) return 'revoked';
  if (row.expiresAt === null || Date.parse(row.expiresAt) <= now.getTime()) return 'expired';
  return 'active';
}

function dedupe(scopes: readonly ApiKeyScope[]): ApiKeyScope[] {
  return [...new Set(scopes)];
}

/** Absent → 90 days. Present → future, and at most 365 days out. */
export function resolveExpiry(requested: string | undefined, now: Date): Date {
  if (requested === undefined) return new Date(now.getTime() + API_KEY_DEFAULT_TTL_DAYS * DAY_MS);
  const at = Date.parse(requested);
  if (!Number.isFinite(at)) throw new BadRequestException('validation_error');
  if (at <= now.getTime()) throw new BadRequestException('validation_error');
  if (at > now.getTime() + API_KEY_MAX_TTL_DAYS * DAY_MS + EXPIRY_SKEW_MS) {
    throw new BadRequestException('validation_error');
  }
  return new Date(at);
}

export function isFreshLogin(lastSignInAt: number | null, now: Date): boolean {
  if (lastSignInAt === null) return false;
  const nowSeconds = now.getTime() / 1000;
  if (lastSignInAt > nowSeconds + AMR_FUTURE_SKEW_SECONDS) return false;
  return nowSeconds - lastSignInAt <= API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS;
}

function formatUtc(value: string): string {
  return `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
