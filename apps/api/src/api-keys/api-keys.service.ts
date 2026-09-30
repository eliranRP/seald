import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  API_KEY_SEND_FRESH_LOGIN_MS,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_API_KEY_SCOPES,
  MAX_API_KEY_EXPIRY_DAYS,
  isApiKeyScope,
  normalizeApiKeyScopes,
  type ApiKeyScope,
} from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { hashesEqual, generateApiKey, parseApiKeyToken } from './api-key-secret';
import { ApiKeysRepository } from './api-keys.repository';
import {
  ApiKeyLimitError,
  ApiKeyNameTakenError,
  ApiKeyPrefixCollisionError,
  toApiKeyView,
  type ApiKeyCreatedView,
  type ApiKeyRecord,
  type ApiKeyView,
} from './api-keys.types';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXPIRY_SKEW_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CreateApiKeyBody {
  readonly name?: unknown;
  readonly scopes?: unknown;
  readonly expires_at?: unknown;
  readonly always_require_signin?: unknown;
}

export interface VerifiedApiKey {
  readonly keyId: string;
  readonly ownerId: string;
  readonly scopes: readonly ApiKeyScope[];
}

@Injectable()
export class ApiKeysService {
  private readonly log = new Logger(ApiKeysService.name);

  constructor(
    private readonly keys: ApiKeysRepository,
    private readonly emails: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async list(user: AuthUser): Promise<readonly ApiKeyView[]> {
    this.requireMailbox(user);
    const rows = await this.keys.listByOwner(user.id);
    return rows.map(toApiKeyView);
  }

  async create(
    user: AuthUser,
    body: CreateApiKeyBody,
    amrSignInAt: number | null,
    now: Date = new Date(),
  ): Promise<ApiKeyCreatedView> {
    this.requireMailbox(user);
    const name = parseOptionalName(body.name);
    const scopes = parseScopes(body.scopes);
    const expiresAt = parseExpiresAt(body.expires_at, now);
    const alwaysRequireSignin = parseOptionalBoolean(body.always_require_signin);
    if (scopes.includes('envelopes:send')) {
      assertFreshLogin(amrSignInAt, now);
    }
    const record = await this.insertWithPrefixRetry({
      ownerId: user.id,
      name,
      scopes,
      expiresAt,
      alwaysRequireSignin,
    });
    await this.enqueueCreatedNotice(user, record);
    return { ...toApiKeyView(record.row), secret: record.secret };
  }

  async revoke(
    user: AuthUser,
    id: string,
    revoked: unknown,
    now: Date = new Date(),
  ): Promise<{ revoked: true }> {
    this.requireMailbox(user);
    this.requireUuid(id);
    if (revoked !== true) throw new BadRequestException('validation_error');
    const row = await this.keys.revoke(id, user.id, now.toISOString());
    if (!row) throw new NotFoundException('not_found');
    await this.keys.expirePendingApprovals(row.id, now);
    return { revoked: true };
  }

  /**
   * Authenticate a `seald_live_` bearer. Missing, malformed, unknown,
   * revoked, and expired credentials throw 401. A missing scope is not
   * a 401: the caller maps that to `insufficient_scope`.
   */
  async authenticate(token: string, now: Date = new Date()): Promise<VerifiedApiKey> {
    const parsed = parseApiKeyToken(token);
    if (!parsed) throw new UnauthorizedException('invalid_key');
    const row = await this.keys.findByPrefix(parsed.prefix);
    // Compare even when the prefix is unknown so a miss is not faster
    // than a hash mismatch.
    const storedHash = row?.keyHash ?? parsed.keyHash.replace(/[0-9a-f]/g, '0');
    if (!row || !hashesEqual(storedHash, parsed.keyHash)) {
      throw new UnauthorizedException('invalid_key');
    }
    if (row.revokedAt) throw new UnauthorizedException('key_revoked');
    if (row.expiresAt && Date.parse(row.expiresAt) <= now.getTime()) {
      throw new UnauthorizedException('key_expired');
    }
    await this.keys.touchLastUsed(row.id, now);
    return { keyId: row.id, ownerId: row.ownerId, scopes: row.scopes };
  }

  private async insertWithPrefixRetry(input: {
    readonly ownerId: string;
    readonly name: string | null;
    readonly scopes: readonly ApiKeyScope[];
    readonly expiresAt: string;
    readonly alwaysRequireSignin: boolean;
  }): Promise<{ readonly row: ApiKeyRecord; readonly secret: string }> {
    let lastCollision: ApiKeyPrefixCollisionError | null = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const generated = generateApiKey();
      try {
        const row = await this.keys.insertLive({
          ownerId: input.ownerId,
          name: input.name,
          prefix: generated.prefix,
          keyHash: generated.keyHash,
          scopes: input.scopes,
          requireOwnerApproval: true,
          allowNewRecipients: false,
          alwaysRequireSignin: input.alwaysRequireSignin,
          expiresAt: input.expiresAt,
        });
        return { row, secret: generated.token };
      } catch (err) {
        if (err instanceof ApiKeyPrefixCollisionError) {
          lastCollision = err;
          continue;
        }
        if (err instanceof ApiKeyLimitError) throw new ConflictException('key_limit');
        if (err instanceof ApiKeyNameTakenError) throw new ConflictException('name_taken');
        throw err;
      }
    }
    throw lastCollision ?? new ConflictException('name_taken');
  }

  private async enqueueCreatedNotice(
    user: AuthUser,
    created: { row: ApiKeyRecord },
  ): Promise<void> {
    const email = user.email;
    if (!email) return;
    const local = email.split('@')[0]?.trim();
    try {
      await insertOutboundEmailIdempotent(this.emails, {
        kind: 'api_key_created',
        to_email: email,
        to_name: local && local.length > 0 ? local : 'there',
        dedupe_key: `api_key_created:${created.row.id}`,
        payload: {
          key_name: created.row.name,
          key_prefix: created.row.prefix,
          settings_url: `${this.env.APP_PUBLIC_URL}/settings/developers`,
          public_url: this.env.APP_PUBLIC_URL,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.name : 'error';
      this.log.warn(`api_key_created enqueue failed key=${created.row.id} (${message})`);
    }
  }

  private requireMailbox(user: AuthUser): void {
    if (!user.email) throw new ForbiddenException('email_required');
  }

  private requireUuid(id: string): void {
    if (!UUID_RE.test(id)) throw new BadRequestException('validation_error');
  }
}

function assertFreshLogin(amrSignInAt: number | null, now: Date): void {
  if (amrSignInAt === null) throw new ForbiddenException('fresh_login_required');
  const ageMs = now.getTime() - amrSignInAt * 1000;
  if (ageMs > API_KEY_SEND_FRESH_LOGIN_MS) throw new ForbiddenException('fresh_login_required');
}

function parseOptionalName(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string') throw new BadRequestException('validation_error');
  const name = value.trim();
  if (name.length < 1 || name.length > 80 || hasControlChar(name)) {
    throw new BadRequestException('validation_error');
  }
  return name;
}

function hasControlChar(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (value.charCodeAt(index) <= 0x1f) return true;
  }
  return false;
}

function parseScopes(value: unknown): readonly ApiKeyScope[] {
  if (value === undefined) return DEFAULT_API_KEY_SCOPES;
  if (!Array.isArray(value) || value.length === 0)
    throw new BadRequestException('validation_error');
  for (const item of value) {
    if (typeof item !== 'string' || !isApiKeyScope(item)) {
      throw new BadRequestException('validation_error');
    }
  }
  const scopes = normalizeApiKeyScopes(value as string[]);
  if (scopes.length === 0) throw new BadRequestException('validation_error');
  return scopes;
}

function parseExpiresAt(value: unknown, now: Date): string {
  if (value === undefined) {
    return new Date(now.getTime() + DEFAULT_API_KEY_EXPIRY_DAYS * DAY_MS).toISOString();
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new BadRequestException('validation_error');
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new BadRequestException('validation_error');
  if (parsed <= now.getTime()) throw new BadRequestException('validation_error');
  const max = now.getTime() + MAX_API_KEY_EXPIRY_DAYS * DAY_MS + MAX_EXPIRY_SKEW_MS;
  if (parsed > max) throw new BadRequestException('validation_error');
  return new Date(parsed).toISOString();
}

function parseOptionalBoolean(value: unknown): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new BadRequestException('validation_error');
  return value;
}
