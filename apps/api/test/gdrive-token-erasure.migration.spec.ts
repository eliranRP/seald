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
});
