import { createHash } from 'node:crypto';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import {
  API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
  API_KEY_MAX_LIVE,
  API_KEY_PREFIX,
  API_KEY_SCOPES,
  API_KEY_TTL_CHOICES_DAYS,
  uuid,
  type ApiKeyScope,
} from 'shared';
import { z } from 'zod';
import type { ApiKeyRecord, ApiKeysService } from '../../../api-keys/api-keys.service';
import type { ConnectedAppsService } from '../../oauth/connected-apps.service';
import type {
  ApprovalKindContext,
  ApprovalKindHandler,
  DescribedSubject,
} from '../../../approvals/kinds/approval-kind';

const CreateArgs = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  expires_in_days: z
    .number()
    .int()
    .refine((d) => (API_KEY_TTL_CHOICES_DAYS as readonly number[]).includes(d)),
});
export type ApiKeyCreateArgs = z.infer<typeof CreateArgs>;

const KeyArgs = z.strictObject({ api_key_id: uuid });
type KeyArgs = z.infer<typeof KeyArgs>;

const ToggleArgs = z.strictObject({ api_key_id: uuid, require_owner_approval: z.literal(false) });
type ToggleArgs = z.infer<typeof ToggleArgs>;

/** The eight characters after `seald_live_`: enough to tell keys apart, never the literal prefix. */
export function keyHint(prefix: string): string {
  return prefix.startsWith(API_KEY_PREFIX) ? prefix.slice(API_KEY_PREFIX.length) : prefix;
}

/** Scopes the new key would carry that the asking key does not hold. */
export function scopesBeyond(
  requested: readonly ApiKeyScope[],
  held: readonly string[],
): ApiKeyScope[] {
  const own = new Set(held);
  return requested.filter((s) => !own.has(s));
}

function isLive(key: ApiKeyRecord, now: Date): boolean {
  return (
    key.revokedAt === null && key.expiresAt !== null && Date.parse(key.expiresAt) > now.getTime()
  );
}

/** What the key-creation ceiling reads: the asking key, or the asking OAuth grant (WP-27). */
export interface CeilingSources {
  readonly keys: ApiKeysService;
  readonly apps: Pick<ConnectedAppsService, 'findLive'> | null;
}

/**
 * The ceiling (WP-45): a credential never mints a key with a scope it
 * does not hold itself. For a key, its row's scopes; for an OAuth grant,
 * the grant's scopes. Read at request time and again at decision time, so
 * narrowing or revoking the asker in between fails the approval instead
 * of minting.
 */
async function heldScopes(
  src: CeilingSources,
  ctx: ApprovalKindContext,
): Promise<readonly string[]> {
  if (ctx.oauthGrantId) {
    const app = src.apps ? await src.apps.findLive(ctx.ownerId, ctx.oauthGrantId) : null;
    if (!app) throw new ForbiddenException('oauth_grant_revoked');
    return app.scopes;
  }
  const asking = ctx.apiKeyId ? await src.keys.findOwned(ctx.ownerId, ctx.apiKeyId) : null;
  if (!asking || !isLive(asking, ctx.now)) throw new ForbiddenException('api_key_revoked');
  return asking.scopes;
}

async function assertWithinCeiling(
  src: CeilingSources,
  args: ApiKeyCreateArgs,
  ctx: ApprovalKindContext,
): Promise<void> {
  if (scopesBeyond(args.scopes, await heldScopes(src, ctx)).length > 0) {
    throw new ForbiddenException('scope_exceeds_key');
  }
}

function keySubject(
  subjectKey: string,
  facts: ReadonlyArray<{ label: string; value: string }>,
): DescribedSubject {
  return {
    subjectKey,
    envelopeId: null,
    title: null,
    recipients: [],
    pageCount: null,
    destination: null,
    files: [],
    fields: [],
    facts,
  };
}

async function liveOwnedKey(
  keys: ApiKeysService,
  ownerId: string,
  id: string,
): Promise<ApiKeyRecord> {
  const key = await keys.findOwned(ownerId, id);
  if (!key) throw new NotFoundException('api_key_not_found');
  if (key.revokedAt !== null) throw new ConflictException('api_key_already_revoked');
  return key;
}

function sortedScopes(scopes: readonly string[]): string[] {
  return [...new Set(scopes)].sort();
}

/**
 * `api_key_create` (WP-45, D5). Approve mints the key through the same
 * `ApiKeysService` path as `POST /me/api-keys` (cap of 10, `Key N`,
 * owner email) and hands the secret to the approval page once, through
 * `revealOnce`: never to `result`, a log, an event, or a tool result.
 * Approve needs a sign-in from the last 10 minutes, the same freshness
 * minting an elevated scope needs in the app.
 */
export function apiKeyCreateHandler(
  keys: ApiKeysService,
  apps: Pick<ConnectedAppsService, 'findLive'> | null = null,
): ApprovalKindHandler<ApiKeyCreateArgs> {
  const ceiling: CeilingSources = { keys, apps };
  return {
    kind: 'api_key_create',
    tool: 'api_keys_create',
    actionLabel: 'Create an API key',
    ready: true,
    args: CreateArgs,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx) {
      await assertWithinCeiling(ceiling, args, ctx);
      const live = (await keys.listForOwner(ctx.ownerId)).filter((k) => k.revokedAt === null);
      if (live.length >= API_KEY_MAX_LIVE) throw new ConflictException('api_key_limit_reached');
      const scopes = sortedScopes(args.scopes);
      const digest = createHash('sha256')
        .update(JSON.stringify({ n: args.name ?? null, s: scopes, d: args.expires_in_days }))
        .digest('hex')
        .slice(0, 32);
      return keySubject(`api_key_create:${digest}`, [
        { label: 'Name', value: args.name ?? 'Next free “Key N”' },
        { label: 'Scopes', value: scopes.join(', ') },
        { label: 'Expires', value: `${String(args.expires_in_days)} days after you approve` },
      ]);
    },
    async execute(args, ctx) {
      await assertWithinCeiling(ceiling, args, ctx);
      const created = await keys.createOnApproval({
        ownerId: ctx.ownerId,
        ownerEmail: ctx.ownerEmail,
        name: args.name ?? null,
        scopes: args.scopes,
        expiresInDays: args.expires_in_days,
        now: ctx.now,
      });
      ctx.revealOnce?.({ api_key_secret: created.secret });
      return {
        api_key_id: created.key.id,
        name: created.key.name,
        key_hint: keyHint(created.key.prefix),
        scopes: created.key.scopes,
        expires_at: created.key.expires_at,
      };
    },
  };
}

/** `api_key_revoke` (WP-45, D5) → `POST /me/api-keys/:id/revoke`. */
export function apiKeyRevokeHandler(keys: ApiKeysService): ApprovalKindHandler<KeyArgs> {
  return {
    kind: 'api_key_revoke',
    tool: 'api_keys_revoke',
    actionLabel: 'Revoke an API key',
    ready: true,
    args: KeyArgs,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx) {
      const key = await liveOwnedKey(keys, ctx.ownerId, args.api_key_id);
      return keySubject(`api_key:${key.id}`, [
        { label: 'Key', value: key.name },
        { label: 'Key ending', value: keyHint(key.prefix) },
        { label: 'Scopes', value: sortedScopes(key.scopes).join(', ') },
      ]);
    },
    async execute(args, ctx) {
      await keys.revokeForOwner(ctx.ownerId, args.api_key_id, ctx.now);
      return { revoked: true, api_key_id: args.api_key_id };
    },
  };
}

/**
 * `approval_required_toggle` (WP-45, D5): turn "ask before each send"
 * off for one key. Only `false` ever waits on the owner; the tool turns
 * it back on at once. A recipient who is not known still falls back to
 * approval on that key, as the send path already does.
 */
export function approvalRequiredToggleHandler(
  keys: ApiKeysService,
): ApprovalKindHandler<ToggleArgs> {
  return {
    kind: 'approval_required_toggle',
    tool: 'approvals_set_required',
    actionLabel: 'Stop asking before each send',
    ready: true,
    args: ToggleArgs,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx) {
      const key = await liveOwnedKey(keys, ctx.ownerId, args.api_key_id);
      if (!key.requireOwnerApproval) throw new ConflictException('approval_already_off');
      return keySubject(`api_key:${key.id}:require_owner_approval`, [
        { label: 'Key', value: key.name },
        { label: 'Key ending', value: keyHint(key.prefix) },
        { label: 'Ask before each send', value: 'Off' },
      ]);
    },
    async execute(args, ctx) {
      await keys.setRequireOwnerApproval(ctx.ownerId, args.api_key_id, false);
      return { api_key_id: args.api_key_id, require_owner_approval: false };
    },
  };
}
