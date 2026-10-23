import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SUPPORTED_LOCALES } from 'shared';

/**
 * The locale check constraints (migration 0035) hard-code the supported
 * list. Adding a locale to SUPPORTED_LOCALES without a follow-up migration
 * would make inserts of that locale fail at the database, so fail here
 * first. Fix: add a new forward migration that drops and re-adds
 * `envelopes_locale_supported` and `envelope_signers_locale_supported`
 * with the longer list, then extend LOCALE_MIGRATIONS below.
 */
const LOCALE_MIGRATIONS = ['0035_locales.sql'];

const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations');

function lastConstraintList(constraint: string): string[] {
  let latest: string[] | undefined;
  for (const file of LOCALE_MIGRATIONS) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    const re = new RegExp(
      `add constraint ${constraint}\\s+check \\(locale is null or locale in \\(([^)]*)\\)\\)`,
      'g',
    );
    for (const m of sql.matchAll(re)) {
      latest = (m[1] ?? '').split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    }
  }
  if (!latest) throw new Error(`no ${constraint} found in locale migrations`);
  return latest;
}

describe('locale check constraints', () => {
  it.each(['envelopes_locale_supported', 'envelope_signers_locale_supported'])(
    '%s lists exactly SUPPORTED_LOCALES',
    (constraint) => {
      expect([...lastConstraintList(constraint)].sort()).toEqual([...SUPPORTED_LOCALES].sort());
    },
  );
});
