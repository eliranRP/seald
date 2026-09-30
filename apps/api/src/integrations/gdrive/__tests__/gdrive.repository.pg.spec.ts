import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../../test/pg-mem-db';
import type { GDriveAccount } from '../gdrive.repository';
import { GDrivePgRepository } from '../gdrive.repository.pg';

function account(userId: string, googleUserId: string): GDriveAccount {
  return {
    id: randomUUID(),
    userId,
    googleUserId,
    googleEmail: `${googleUserId}@example.com`,
    refreshTokenCiphertext: Buffer.from(`cipher-${googleUserId}`),
    refreshTokenKmsKeyArn: `arn:aws:kms:us-east-1:0:key/${googleUserId}`,
    scope: 'https://www.googleapis.com/auth/drive.file',
    connectedAt: new Date().toISOString(),
    lastUsedAt: null,
    deletedAt: null,
  };
}

describe('GDrivePgRepository token erasure', () => {
  let handle: PgMemHandle;
  let repo: GDrivePgRepository;
  let userA: string;
  let userB: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new GDrivePgRepository(handle.db);
    userA = await seedUser(handle);
    userB = await seedUser(handle);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('disconnect clears token columns and keeps the connection row', async () => {
    const seeded = await repo.insert(account(userA, 'google-a'));
    const cleared = await repo.disconnect(seeded.id, userA);

    expect(cleared).toBe(true);
    const row = await repo.findByIdForUserIncludingDeleted(seeded.id, userA);
    expect(row?.deletedAt).toEqual(expect.any(String));
    expect(row?.refreshTokenCiphertext).toBeNull();
    expect(row?.refreshTokenKmsKeyArn).toBeNull();
    expect(row?.googleEmail).toBe('google-a@example.com');
    expect(row?.googleUserId).toBe('google-a');
    expect(await repo.findByIdForUser(seeded.id, userA)).toBeNull();

    const again = await repo.disconnect(seeded.id, userA);
    expect(again).toBe(true);
    const second = await repo.findByIdForUserIncludingDeleted(seeded.id, userA);
    expect(second?.deletedAt).toBe(row?.deletedAt);
    expect(second?.refreshTokenCiphertext).toBeNull();
  });

  it('disconnect leaves an already-set deleted_at in place', async () => {
    const seeded = await repo.insert(account(userA, 'google-legacy'));
    await handle.db
      .updateTable('gdrive_accounts')
      .set({ deleted_at: '2026-01-02T03:04:05.000Z' })
      .where('id', '=', seeded.id)
      .execute();

    await repo.disconnect(seeded.id, userA);
    const row = await repo.findByIdForUserIncludingDeleted(seeded.id, userA);
    expect(row?.refreshTokenCiphertext).toBeNull();
    expect(row?.refreshTokenKmsKeyArn).toBeNull();
    expect(row?.deletedAt).toBe('2026-01-02T03:04:05.000Z');
  });

  it('disconnect does not touch another user', async () => {
    const seeded = await repo.insert(account(userA, 'google-a'));
    expect(await repo.disconnect(seeded.id, userB)).toBe(false);
    const row = await repo.findByIdForUser(seeded.id, userA);
    expect(row?.refreshTokenCiphertext).not.toBeNull();
    expect(row?.deletedAt).toBeNull();
  });

  it('deleteAllByUser removes active and disconnected rows and leaves other users', async () => {
    const active = await repo.insert(account(userA, 'google-active'));
    const disconnected = await repo.insert(account(userA, 'google-old'));
    await repo.disconnect(disconnected.id, userA);
    const other = await repo.insert(account(userB, 'google-b'));

    expect(await repo.deleteAllByUser(userA)).toBe(2);
    expect(await repo.findByIdForUserIncludingDeleted(active.id, userA)).toBeNull();
    expect(await repo.findByIdForUserIncludingDeleted(disconnected.id, userA)).toBeNull();
    expect(await repo.findByIdForUser(other.id, userB)).not.toBeNull();
    expect(await repo.deleteAllByUser(userA)).toBe(0);
  });
});
