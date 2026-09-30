import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { AppEnv } from '../../config/env.schema';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import type { AuthUser } from '../../auth/auth-user';
import { generateApiKey } from '../api-key-secret';
import { InMemoryApiKeysRepository } from '../../../test/in-memory-api-keys-repository';
import { ApiKeysService } from '../api-keys.service';

const USER: AuthUser = {
  id: '00000000-0000-4000-8000-00000000000a',
  email: 'maya@example.com',
  provider: 'email',
};
const GUEST: AuthUser = {
  id: '00000000-0000-4000-8000-00000000000b',
  email: null,
  provider: 'anonymous',
};
const ENV = { APP_PUBLIC_URL: 'https://seald.nromomentum.com' } as AppEnv;

describe('ApiKeysService', () => {
  let repo: InMemoryApiKeysRepository;
  let emails: InMemoryOutboundEmailsRepository;
  let svc: ApiKeysService;
  const now = new Date('2026-09-30T12:00:00.000Z');

  beforeEach(() => {
    repo = new InMemoryApiKeysRepository();
    emails = new InMemoryOutboundEmailsRepository();
    svc = new ApiKeysService(repo, emails, ENV);
  });

  it('creates Key 1 with envelopes:read and a 90-day expiry, and shows the secret once', async () => {
    const created = await svc.create(USER, {}, now);
    expect(created.name).toBe('Key 1');
    expect(created.scopes).toEqual(['envelopes:read']);
    expect(created.require_owner_approval).toBe(true);
    expect(created.secret.startsWith('seald_live_')).toBe(true);
    expect(Date.parse(created.expires_at ?? '')).toBe(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const listed = await svc.list(USER);
    expect(listed).toHaveLength(1);
    expect(JSON.stringify(listed)).not.toContain(created.secret);
    expect(JSON.stringify(listed)).not.toContain('key_hash');
    expect(listed[0]?.prefix).toBe(created.prefix);

    const notice = emails.rows.find((row) => row.kind === 'api_key_created');
    expect(notice?.payload).toMatchObject({
      key_name: 'Key 1',
      key_prefix: created.prefix,
    });
    expect(JSON.stringify(notice?.payload)).not.toContain(created.secret);
  });

  it('rejects a null expiry and an expiry past 365 days', async () => {
    await expect(svc.create(USER, { expires_at: null }, now)).rejects.toThrow('validation_error');
    const tooFar = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000).toISOString();
    await expect(svc.create(USER, { expires_at: tooFar }, now)).rejects.toThrow('validation_error');
  });

  it('rejects envelopes:send until step 10 re-auth exists', async () => {
    await expect(svc.create(USER, { scopes: ['envelopes:send'] }, now)).rejects.toThrow(
      'validation_error',
    );
    await expect(
      svc.create(USER, { scopes: ['envelopes:read', 'envelopes:send'] }, now),
    ).rejects.toThrow('validation_error');
  });

  it('rejects a guest and a second live key with the same name', async () => {
    await expect(svc.create(GUEST, {}, now)).rejects.toBeInstanceOf(ForbiddenException);
    await svc.create(USER, { name: 'Cursor' }, now);
    await expect(svc.create(USER, { name: 'cursor' }, now)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('stops at 10 live keys and frees a slot on revoke', async () => {
    for (let n = 0; n < 10; n += 1) {
      await svc.create(USER, {}, now);
    }
    await expect(svc.create(USER, {}, now)).rejects.toBeInstanceOf(ConflictException);
    const key1 = (await svc.list(USER)).find((row) => row.name === 'Key 1');
    expect(key1).toBeDefined();
    await svc.revoke(USER, key1!.id, true, now);
    const created = await svc.create(USER, {}, now);
    expect(created.name).toBe('Key 1');
  });

  it('authenticates a live key, and rejects revoked, expired, and unknown tokens', async () => {
    const created = await svc.create(USER, {}, now);
    const ok = await svc.authenticate(created.secret, now);
    expect(ok.keyId).toBe(created.id);
    expect(ok.scopes).toEqual(['envelopes:read']);

    await svc.revoke(USER, created.id, true, now);
    await expect(svc.authenticate(created.secret, now)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const later = await svc.create(
      USER,
      { expires_at: new Date(now.getTime() + 60_000).toISOString() },
      now,
    );
    await expect(
      svc.authenticate(later.secret, new Date(now.getTime() + 120_000)),
    ).rejects.toMatchObject({
      message: 'api_key_expired',
    });

    const forged = generateApiKey();
    await expect(svc.authenticate(forged.token, now)).rejects.toMatchObject({
      message: 'invalid_token',
    });
    await expect(svc.authenticate('seald_live_truncated', now)).rejects.toMatchObject({
      message: 'invalid_token',
    });
    await expect(svc.authenticate('', now)).rejects.toMatchObject({
      message: 'missing_token',
    });
    await expect(svc.authenticate(created.secret, now)).rejects.toMatchObject({
      message: 'api_key_revoked',
    });
  });

  it('updates last_used_at at most once a minute', async () => {
    const created = await svc.create(USER, {}, now);
    await svc.authenticate(created.secret, now);
    await svc.authenticate(created.secret, new Date(now.getTime() + 10_000));
    const once = await repo.findByIdForOwner(created.id, USER.id);
    expect(once?.lastUsedAt).toBe(now.toISOString());
    const later = new Date(now.getTime() + 61_000);
    await svc.authenticate(created.secret, later);
    const twice = await repo.findByIdForOwner(created.id, USER.id);
    expect(twice?.lastUsedAt).toBe(later.toISOString());
  });

  it('lets one of two concurrent creates through when one slot remains', async () => {
    for (let n = 0; n < 9; n += 1) {
      await svc.create(USER, {}, now);
    }
    const results = await Promise.allSettled([
      svc.create(USER, {}, now),
      svc.create(USER, {}, now),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ message: 'key_limit' });
  });

  it('does not count expired keys toward the cap', async () => {
    for (let n = 0; n < 10; n += 1) {
      await svc.create(USER, {}, now);
    }
    const past = new Date(Date.now() - 60_000).toISOString();
    for (let index = 0; index < repo.rows.length; index += 1) {
      const row = repo.rows[index];
      if (!row) continue;
      repo.rows[index] = { ...row, expiresAt: past };
    }
    const created = await svc.create(USER, {}, now);
    expect(created.name).toBe('Key 11');
  });
});
