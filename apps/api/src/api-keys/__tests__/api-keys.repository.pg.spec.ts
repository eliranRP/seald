import { DataType } from 'pg-mem';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { ApiKeysPgRepository } from '../api-keys.repository.pg';
import { ApiKeyLimitError } from '../api-keys.types';

describe('ApiKeysPgRepository', () => {
  let handle: PgMemHandle;
  let repo: ApiKeysPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    handle.mem.public.registerFunction({
      name: 'pg_advisory_xact_lock',
      args: [DataType.integer, DataType.integer],
      returns: DataType.integer,
      implementation: () => 1,
    });
    handle.mem.public.registerFunction({
      name: 'to_regclass',
      args: [DataType.text],
      returns: DataType.text,
      implementation: () => null,
    });
    ownerId = await seedUser(handle);
    repo = new ApiKeysPgRepository(handle.db);
  });

  afterEach(async () => {
    await handle.close();
  });

  const base = (prefix: string, name: string | null) => ({
    ownerId,
    name,
    prefix,
    keyHash: 'a'.repeat(64),
    scopes: ['envelopes:read'] as const,
    requireOwnerApproval: true,
    allowNewRecipients: false,
    alwaysRequireSignin: false,
    approvalNotify: 'email' as const,
    expiresAt: '2026-12-29T00:00:00.000Z',
  });

  it('stores a hash and prefix, not a recoverable secret column', async () => {
    const row = await repo.insertLive(base('seald_live_abcdefgh', null));
    expect(row.name).toBe('Key 1');
    expect(row.keyHash).toBe('a'.repeat(64));
    expect(row.prefix).toBe('seald_live_abcdefgh');
    const listed = await repo.listByOwner(ownerId);
    expect(listed.map((item) => item.prefix)).toEqual(['seald_live_abcdefgh']);
  });

  it('enforces the live cap and leaves a revoked row in place', async () => {
    for (let n = 0; n < 10; n += 1) {
      await repo.insertLive(base(`seald_live_pref${n}xxx`, `Key ${n + 1}`));
    }
    await expect(repo.insertLive(base('seald_live_overflow1', 'Key 11'))).rejects.toBeInstanceOf(
      ApiKeyLimitError,
    );
    const first = (await repo.listByOwner(ownerId)).find((row) => row.name === 'Key 1');
    const revoked = await repo.revoke(first!.id, ownerId, '2026-09-30T12:00:00.000Z');
    expect(revoked?.revokedAt).toBeTruthy();
    const again = await repo.insertLive(base('seald_live_afterrevoke', null));
    expect(again.name).toBe('Key 1');
    await expect(repo.expirePendingApprovals(first!.id, new Date())).resolves.toBeUndefined();
  });
});
