import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { CreateApiKeyResponseSchema, ApiKeyListResponseSchema } from 'shared';
import { InMemoryApiKeysRepository } from '../../../test/in-memory-api-keys-repository';
import { InMemoryOutboundEmailsRepository } from '../../../test/in-memory-outbound-emails-repository';
import type { AuthUser } from '../../auth/auth-user';
import type { AppEnv } from '../../config/env.schema';
import { ApiKeyAuthService } from '../api-key-auth.service';
import { nextDefaultKeyName } from '../api-keys.repository';
import { ApiKeysService, isFreshLogin, resolveExpiry } from '../api-keys.service';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const NOW_S = NOW.getTime() / 1000;
const DAY = 86_400_000;
const OWNER = '00000000-0000-0000-0000-00000000000a';
const OTHER = '00000000-0000-0000-0000-00000000000b';

const USER: AuthUser = {
  id: OWNER,
  email: 'maya@example.com',
  provider: 'email',
  lastSignInAt: NOW_S - 3600,
};
const FRESH: AuthUser = { ...USER, lastSignInAt: NOW_S - 60 };

function setup() {
  const outbox = new InMemoryOutboundEmailsRepository();
  const repo = new InMemoryApiKeysRepository(outbox);
  const env = { APP_PUBLIC_URL: 'https://seald.example/' } as AppEnv;
  const svc = new ApiKeysService(repo, env);
  return { outbox, repo, svc, auth: new ApiKeyAuthService(repo) };
}

async function expectError(p: Promise<unknown>, type: new (...a: never[]) => Error, slug: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(type);
  expect((err as Error).message).toBe(slug);
}

describe('ApiKeysService.create', () => {
  it('POST {} creates Key 1, envelopes:read only, 90-day expiry, approval on', async () => {
    const { svc } = setup();
    const res = await svc.create(USER, {}, NOW);
    expect(CreateApiKeyResponseSchema.parse(res)).toBeTruthy();
    expect(res.key.name).toBe('Key 1');
    expect(res.key.scopes).toEqual(['envelopes:read']);
    expect(res.key.expires_at).toBe(new Date(NOW.getTime() + 90 * DAY).toISOString());
    expect(res.key.require_owner_approval).toBe(true);
    expect(res.key.allow_new_recipients).toBe(false);
    expect(res.key.always_require_signin).toBe(false);
    expect(res.key.status).toBe('active');
    expect(res.secret).toMatch(/^seald_live_[A-Za-z0-9_-]{49}$/);
    expect(res.secret.startsWith(res.key.prefix)).toBe(true);
  });

  it('an undefined body behaves like {}', async () => {
    const { svc } = setup();
    expect((await svc.create(USER, undefined, NOW)).key.name).toBe('Key 1');
  });

  it('stores only the SHA-256, never the secret', async () => {
    const { svc, repo } = setup();
    const res = await svc.create(USER, {}, NOW);
    const stored = JSON.stringify(repo.rows);
    expect(stored).not.toContain(res.secret.slice('seald_live_'.length));
    expect(repo.rows[0]!.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the created key verifies, and the list never carries the secret or hash', async () => {
    const { svc, auth, repo } = setup();
    const res = await svc.create(USER, {}, NOW);
    const verified = await auth.verify(res.secret, NOW);
    expect(verified).toMatchObject({ ok: true, ownerId: OWNER, keyId: res.key.id });
    const list = await svc.list(USER, NOW);
    expect(ApiKeyListResponseSchema.parse(list).items).toHaveLength(1);
    const wire = JSON.stringify(list);
    expect(wire).not.toContain(res.secret.slice('seald_live_'.length));
    expect(wire).not.toContain(repo.rows[0]!.keyHash);
    expect(wire).not.toMatch(/key_hash|keyHash/);
  });

  it('names default keys Key N with the next free N, revoked names included', async () => {
    const { svc } = setup();
    const k1 = await svc.create(USER, {}, NOW);
    await svc.create(USER, {}, NOW);
    await svc.revoke(USER, k1.key.id, NOW);
    expect((await svc.create(USER, {}, NOW)).key.name).toBe('Key 3');
    await svc.create(USER, { name: 'Key 5' }, NOW);
    expect((await svc.create(USER, {}, NOW)).key.name).toBe('Key 4');
    expect((await svc.create(USER, {}, NOW)).key.name).toBe('Key 6');
  });

  it('rejects guest and anonymous sessions (no email)', async () => {
    const { svc, repo } = setup();
    await expectError(
      svc.create({ ...USER, email: null }, {}, NOW),
      ForbiddenException,
      'email_required',
    );
    expect(repo.rows).toHaveLength(0);
  });

  describe('expiry', () => {
    it('null expires_at is validation_error (no "never")', async () => {
      const { svc } = setup();
      await expectError(
        svc.create(USER, { expires_at: null }, NOW),
        BadRequestException,
        'validation_error',
      );
    });

    it('rejects more than 365 days out', async () => {
      const { svc } = setup();
      const at = new Date(NOW.getTime() + 366 * DAY).toISOString();
      await expectError(
        svc.create(USER, { expires_at: at }, NOW),
        BadRequestException,
        'validation_error',
      );
    });

    it('accepts exactly 365 days and the 30-day choice', async () => {
      const { svc } = setup();
      const at365 = new Date(NOW.getTime() + 365 * DAY).toISOString();
      expect((await svc.create(USER, { expires_at: at365 }, NOW)).key.expires_at).toBe(at365);
      const at30 = new Date(NOW.getTime() + 30 * DAY).toISOString();
      expect((await svc.create(USER, { expires_at: at30 }, NOW)).key.expires_at).toBe(at30);
    });

    it('rejects a past or present expiry and a non-date', async () => {
      const { svc } = setup();
      for (const expires_at of [NOW.toISOString(), '2020-01-01T00:00:00Z', 'tomorrow', 90]) {
        await expectError(
          svc.create(USER, { expires_at }, NOW),
          BadRequestException,
          'validation_error',
        );
      }
    });

    it('resolveExpiry defaults to 90 days', () => {
      expect(resolveExpiry(undefined, NOW).getTime()).toBe(NOW.getTime() + 90 * DAY);
    });
  });

  describe('body validation', () => {
    it.each([
      [{ scopes: [] }],
      [{ scopes: ['envelopes:read', 'root'] }],
      [{ name: '' }],
      [{ name: 'x'.repeat(81) }],
      [{ require_owner_approval: false }],
      [{ allow_new_recipients: true }],
      [{ secret: 'mine' }],
      ['not-an-object'],
    ])('%j is validation_error', async (body) => {
      const { svc } = setup();
      await expectError(svc.create(FRESH, body, NOW), BadRequestException, 'validation_error');
    });

    it('accepts a name, scopes and always_require_signin; dedupes scopes', async () => {
      const { svc } = setup();
      const res = await svc.create(
        USER,
        {
          name: '  CI bot ',
          scopes: ['envelopes:read', 'templates:read', 'envelopes:read'],
          always_require_signin: true,
        },
        NOW,
      );
      expect(res.key.name).toBe('CI bot');
      expect(res.key.scopes).toEqual(['envelopes:read', 'templates:read']);
      expect(res.key.always_require_signin).toBe(true);
    });

    it('a live key name is unique per owner, case-insensitively', async () => {
      const { svc } = setup();
      await svc.create(USER, { name: 'Laptop' }, NOW);
      await expectError(
        svc.create(USER, { name: 'laptop' }, NOW),
        ConflictException,
        'api_key_name_taken',
      );
      await svc.create({ ...USER, id: OTHER }, { name: 'Laptop' }, NOW);
    });

    it('a revoked name can be reused', async () => {
      const { svc } = setup();
      const k = await svc.create(USER, { name: 'Laptop' }, NOW);
      await svc.revoke(USER, k.key.id, NOW);
      expect((await svc.create(USER, { name: 'Laptop' }, NOW)).key.name).toBe('Laptop');
    });
  });

  describe('fresh login (amr) for envelopes:send', () => {
    it('rejects envelopes:send when the last real sign-in is older than 10 minutes', async () => {
      const { svc, repo } = setup();
      await expectError(
        svc.create(USER, { scopes: ['envelopes:read', 'envelopes:send'] }, NOW),
        ForbiddenException,
        'fresh_login_required',
      );
      expect(repo.rows).toHaveLength(0);
    });

    it('rejects envelopes:send when the token has no amr', async () => {
      const { svc } = setup();
      await expectError(
        svc.create({ ...USER, lastSignInAt: null }, { scopes: ['envelopes:send'] }, NOW),
        ForbiddenException,
        'fresh_login_required',
      );
    });

    it('allows envelopes:send within 10 minutes of a real sign-in', async () => {
      const { svc } = setup();
      const res = await svc.create(FRESH, { scopes: ['envelopes:read', 'envelopes:send'] }, NOW);
      expect(res.key.scopes).toContain('envelopes:send');
    });

    it.each(['account:admin', 'keys:admin', 'envelopes:sign'])(
      '%s also needs a fresh sign-in',
      async (scope) => {
        const { svc } = setup();
        await expectError(
          svc.create(USER, { scopes: [scope] }, NOW),
          ForbiddenException,
          'fresh_login_required',
        );
        expect((await svc.create(FRESH, { scopes: [scope] }, NOW)).key.scopes).toEqual([scope]);
      },
    );

    it('read-only scopes need no fresh sign-in', async () => {
      const { svc } = setup();
      await svc.create(
        { ...USER, lastSignInAt: null },
        { scopes: ['envelopes:read', 'templates:read'] },
        NOW,
      );
    });

    it('isFreshLogin: boundary at 600 s, future amr beyond skew is not fresh', () => {
      expect(isFreshLogin(NOW_S - 600, NOW)).toBe(true);
      expect(isFreshLogin(NOW_S - 601, NOW)).toBe(false);
      expect(isFreshLogin(NOW_S + 30, NOW)).toBe(true);
      expect(isFreshLogin(NOW_S + 3600, NOW)).toBe(false);
      expect(isFreshLogin(null, NOW)).toBe(false);
    });
  });

  describe('cap of 10 live keys', () => {
    it('the 11th live key is api_key_limit_reached; revoking frees a slot', async () => {
      const { svc } = setup();
      const made = [];
      for (let i = 0; i < 10; i += 1) made.push(await svc.create(USER, {}, NOW));
      await expectError(svc.create(USER, {}, NOW), ConflictException, 'api_key_limit_reached');
      await svc.revoke(USER, made[0]!.key.id, NOW);
      await svc.create(USER, {}, NOW);
    });

    it('expired-but-not-revoked keys still count', async () => {
      const { svc, repo } = setup();
      for (let i = 0; i < 10; i += 1) await svc.create(USER, {}, NOW);
      for (const row of repo.rows) row.expiresAt = new Date(NOW.getTime() - 1).toISOString();
      await expectError(svc.create(USER, {}, NOW), ConflictException, 'api_key_limit_reached');
    });

    it('the cap is per owner', async () => {
      const { svc } = setup();
      for (let i = 0; i < 10; i += 1) await svc.create(USER, {}, NOW);
      await svc.create({ ...USER, id: OTHER, email: 'b@example.com' }, {}, NOW);
    });
  });

  it('retries with a fresh key when the prefix collides', async () => {
    const { svc, repo } = setup();
    const spy = jest
      .spyOn(repo, 'createWithinCap')
      .mockResolvedValueOnce({ ok: false, reason: 'prefix_taken' });
    const res = await svc.create(USER, {}, NOW);
    expect(spy).toHaveBeenCalledTimes(2);
    const prefixes = spy.mock.calls.map((c) => c[0].prefix);
    expect(prefixes[0]).not.toBe(prefixes[1]);
    expect(res.key.prefix).toBe(prefixes[1]);
  });

  describe('creation email', () => {
    it('enqueues one api_key_created mail to the account email, naming key and prefix, without the secret', async () => {
      const { svc, outbox } = setup();
      const res = await svc.create(USER, {}, NOW);
      expect(outbox.rows).toHaveLength(1);
      const row = outbox.rows[0]!;
      expect(row.kind).toBe('api_key_created');
      expect(row.to_email).toBe('maya@example.com');
      expect(row.envelope_id).toBeNull();
      expect(row.dedupe_key).toBe(`api_key_created:${res.key.id}`);
      expect(row.payload).toMatchObject({
        key_name: 'Key 1',
        key_prefix: res.key.prefix,
        scopes_readable: 'envelopes:read',
        settings_url: 'https://seald.example/settings/developers',
        public_url: 'https://seald.example',
      });
      const json = JSON.stringify(row);
      expect(json).not.toContain(res.secret);
      expect(json).not.toContain(res.secret.slice(res.key.prefix.length));
    });

    it('a failed email insert creates no key', async () => {
      const { svc, outbox, repo } = setup();
      jest.spyOn(outbox, 'insert').mockRejectedValueOnce(new Error('db down'));
      await expect(svc.create(USER, {}, NOW)).rejects.toThrow('db down');
      expect(repo.rows).toHaveLength(0);
    });
  });
});

describe('ApiKeysService.revoke', () => {
  it('sets revoked_at, keeps the row, and the key stops verifying', async () => {
    const { svc, repo, auth } = setup();
    const res = await svc.create(USER, {}, NOW);
    expect(await svc.revoke(USER, res.key.id, NOW)).toEqual({ revoked: true });
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]!.revokedAt).toBe(NOW.toISOString());
    expect(await auth.verify(res.secret, NOW)).toEqual({ ok: false, error: 'api_key_revoked' });
    expect((await svc.list(USER, NOW)).items).toHaveLength(0);
  });

  it('is idempotent for an already revoked key', async () => {
    const { svc } = setup();
    const res = await svc.create(USER, {}, NOW);
    await svc.revoke(USER, res.key.id, NOW);
    expect(await svc.revoke(USER, res.key.id, NOW)).toEqual({ revoked: true });
  });

  it("another owner's key is api_key_not_found and stays live", async () => {
    const { svc, repo } = setup();
    const res = await svc.create(USER, {}, NOW);
    await expectError(
      svc.revoke({ ...USER, id: OTHER }, res.key.id, NOW),
      NotFoundException,
      'api_key_not_found',
    );
    expect(repo.rows[0]!.revokedAt).toBeNull();
  });
});

describe('ApiKeysService.list', () => {
  it('shows Expired for a key past expires_at and only the caller’s live keys', async () => {
    const { svc, repo } = setup();
    await svc.create(USER, {}, NOW);
    await svc.create({ ...USER, id: OTHER }, {}, NOW);
    repo.rows[0]!.expiresAt = new Date(NOW.getTime() - 1).toISOString();
    const list = await svc.list(USER, NOW);
    expect(list.items).toHaveLength(1);
    expect(list.items[0]!.status).toBe('expired');
  });
});

describe('ApiKeysService.deleteAllForOwner (account deletion)', () => {
  it("removes every row of that owner, revoked included, and nobody else's", async () => {
    const { svc, repo } = setup();
    const k = await svc.create(USER, {}, NOW);
    await svc.create(USER, {}, NOW);
    await svc.revoke(USER, k.key.id, NOW);
    await svc.create({ ...USER, id: OTHER }, {}, NOW);
    expect(await svc.deleteAllForOwner(OWNER)).toBe(2);
    expect(repo.rows.map((r) => r.ownerId)).toEqual([OTHER]);
  });
});

describe('nextDefaultKeyName', () => {
  it('picks the smallest free N, ignoring non-default names and case', () => {
    expect(nextDefaultKeyName([])).toBe('Key 1');
    expect(nextDefaultKeyName(['Key 1', 'key 2', 'Laptop', 'Key 4'])).toBe('Key 3');
    expect(nextDefaultKeyName(['Key 01'])).toBe('Key 2');
  });
});
