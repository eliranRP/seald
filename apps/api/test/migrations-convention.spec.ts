import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Regression for Phase 6 prod-bug-loop finding (2026-05-03):
 *
 * `apps/api/scripts/migrate.sh` glob-applies every `*.sql` file in
 * `db/migrations/` in lexicographic order. When WT-A-1 introduced the
 * paired-down-script convention (`<id>_<name>.sql` + `<id>_<name>_down.sql`),
 * both files lived at the same top-level path, so on every container boot
 * the down script ran immediately after the up script — silently dropping
 * the table. Production was left with NO `gdrive_accounts` table; flipping
 * `feature.gdriveIntegration` ON would 500 every Drive request.
 *
 * The fix is structural: down scripts live in `db/migrations/down/` and
 * the runner only globs the top-level files. This test asserts that
 * convention so a future PR can never re-introduce the regression by
 * dropping a `_down.sql` next to its `_up`.
 */
describe('db/migrations directory convention', () => {
  const migrationsDir = join(__dirname, '..', 'db', 'migrations');

  it('contains no top-level *_down.sql files (down scripts must live in db/migrations/down/)', () => {
    const entries = readdirSync(migrationsDir, { withFileTypes: true });
    const offending = entries
      .filter((e) => e.isFile())
      .map((e) => e.name)
      .filter((name) => /_down\.sql$/.test(name));
    expect(offending).toEqual([]);
  });

  it('every up-migration has a paired down script in db/migrations/down/', () => {
    const top = readdirSync(migrationsDir, { withFileTypes: true })
      .filter((e) => e.isFile() && /^\d{4}_.+\.sql$/.test(e.name))
      .map((e) => e.name);
    const downDir = join(migrationsDir, 'down');
    const downs = readdirSync(downDir, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
    // Every up file 0013+ must have a paired down (the convention started
    // at 0013 — earlier migrations are forward-only and grandfathered in).
    const expectedDowns = top
      .filter((name) => Number(name.slice(0, 4)) >= 13)
      .map((name) => name.replace(/\.sql$/, '_down.sql'));
    for (const expected of expectedDowns) {
      expect(downs).toContain(expected);
    }
  });
});
