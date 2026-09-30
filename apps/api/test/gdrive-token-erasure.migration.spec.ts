import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser } from './pg-mem-db';

/**
 * Migration 0021 erases Drive tokens that account deletion used to
 * orphan (`user_id` SET NULL) and lets disconnect store NULL ciphertext.
 * pg-mem cannot reliably drop and re-add foreign keys, so the cascade
 * clause is pinned on the SQL text and the orphan DELETE is executed.
 */
function statements(sqlText: string): string[] {
  return sqlText
    .split(';')
    .map((part) =>
      part
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .trim(),
    )
    .filter((part) => part.length > 0);
}

describe('0021_gdrive_token_erasure', () => {
  const migrationsDir = join(__dirname, '..', 'db', 'migrations');
  const sqlText = readFileSync(join(migrationsDir, '0021_gdrive_token_erasure.sql'), 'utf8');
  const parts = statements(sqlText);

  it('switches the auth.users foreign key to ON DELETE CASCADE and allows null token columns', () => {
    const addFk = parts.find((part) => /add constraint gdrive_accounts_user_id_fkey/i.test(part));
    expect(addFk).toMatch(/references auth\.users\(id\)/i);
    expect(addFk).toMatch(/on delete cascade/i);
    expect(addFk).not.toMatch(/set null/i);
    expect(
      parts.some((part) => /alter column refresh_token_ciphertext drop not null/i.test(part)),
    ).toBe(true);
    expect(
      parts.some((part) => /alter column refresh_token_kms_key_arn drop not null/i.test(part)),
    ).toBe(true);
    expect(parts.some((part) => /delete from public\.gdrive_accounts/i.test(part))).toBe(true);
  });

  it('deletes gdrive rows whose user_id is null and keeps rows that still have a user', async () => {
    const deleteOrphans = parts.find((part) => /delete from public\.gdrive_accounts/i.test(part));
    if (!deleteOrphans) throw new Error('missing orphan delete');

    const handle = createPgMemDb();
    try {
      const userId = await seedUser(handle);
      const keptId = randomUUID();
      const orphanId = randomUUID();
      handle.mem.public.none(
        `alter table public.gdrive_accounts alter column user_id drop not null`,
      );
      handle.mem.public.none(`
        insert into public.gdrive_accounts
          (id, user_id, google_user_id, google_email, refresh_token_ciphertext,
           refresh_token_kms_key_arn, scope)
        values
          ('${keptId}', '${userId}', 'kept-google', 'kept@example.com', 'kept-secret',
           'arn:kept', 'https://www.googleapis.com/auth/drive.file'),
          ('${orphanId}', null, 'orphan-google', 'orphan@example.com', 'orphan-secret',
           'arn:orphan', 'https://www.googleapis.com/auth/drive.file');
      `);

      handle.mem.public.none(deleteOrphans);

      const orphans = await handle.db
        .selectFrom('gdrive_accounts')
        .select(['id', 'refresh_token_ciphertext'])
        .where('user_id', 'is', null)
        .execute();
      expect(orphans).toEqual([]);

      const kept = await handle.db
        .selectFrom('gdrive_accounts')
        .select(['id', 'refresh_token_ciphertext'])
        .where('id', '=', keptId)
        .executeTakeFirst();
      expect(kept?.id).toBe(keptId);
      expect(kept?.refresh_token_ciphertext).toBeTruthy();
    } finally {
      await handle.close();
    }
  });

  it('clears tokens on disconnected rows and keeps tokens on active rows', async () => {
    const clearDisconnected = parts.find(
      (part) =>
        /update public\.gdrive_accounts/i.test(part) && /deleted_at is not null/i.test(part),
    );
    if (!clearDisconnected) throw new Error('missing disconnected-token update');

    const handle = createPgMemDb();
    try {
      const userId = await seedUser(handle);
      const activeId = randomUUID();
      const disconnectedId = randomUUID();
      handle.mem.public.none(`
        insert into public.gdrive_accounts
          (id, user_id, google_user_id, google_email, refresh_token_ciphertext,
           refresh_token_kms_key_arn, scope, deleted_at)
        values
          ('${activeId}', '${userId}', 'active-google', 'active@example.com', 'live-secret',
           'arn:live', 'https://www.googleapis.com/auth/drive.file', null),
          ('${disconnectedId}', '${userId}', 'old-google', 'old@example.com', 'old-secret',
           'arn:old', 'https://www.googleapis.com/auth/drive.file', '2026-01-01T00:00:00Z');
      `);

      handle.mem.public.none(clearDisconnected);

      const active = await handle.db
        .selectFrom('gdrive_accounts')
        .select(['refresh_token_ciphertext', 'refresh_token_kms_key_arn', 'google_email'])
        .where('id', '=', activeId)
        .executeTakeFirst();
      expect(active?.refresh_token_ciphertext).toBeTruthy();
      expect(active?.refresh_token_kms_key_arn).toBeTruthy();
      expect(active?.google_email).toBe('active@example.com');

      const disconnected = await handle.db
        .selectFrom('gdrive_accounts')
        .select([
          'refresh_token_ciphertext',
          'refresh_token_kms_key_arn',
          'google_email',
          'deleted_at',
        ])
        .where('id', '=', disconnectedId)
        .executeTakeFirst();
      expect(disconnected?.refresh_token_ciphertext).toBeNull();
      expect(disconnected?.refresh_token_kms_key_arn).toBeNull();
      expect(disconnected?.google_email).toBe('old@example.com');
      expect(disconnected?.deleted_at).toBeTruthy();
    } finally {
      await handle.close();
    }
  });
});
