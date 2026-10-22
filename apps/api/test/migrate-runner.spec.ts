import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

/**
 * scripts/migrate.sh against a fake `psql`, so the runner's ordering
 * rule is pinned without a database.
 *
 * WP-03 added 0022_envelope_documents.sql after 0027 was already applied
 * on prod. The runner must apply 0022 on the next boot (it skips by
 * filename, not by "highest id seen") and must skip 0027. The real-
 * Postgres version of this check lives in envelope-documents.pg.e2e-spec.ts.
 */
const execFileAsync = promisify(execFile);
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const SCRIPT = resolve(__dirname, '../scripts/migrate.sh');

const FAKE_PSQL = `#!/bin/sh
# Fake psql for migrate-runner.spec.ts.
for arg in "$@"; do
  case "$arg" in
    -At) cat "$FAKE_APPLIED"; exit 0 ;;
  esac
done
prev=""
for arg in "$@"; do
  if [ "$prev" = "-f" ]; then
    echo "APPLY $(basename "$arg")" >> "$FAKE_LOG"
    exit 0
  fi
  if [ "$prev" = "-c" ]; then
    echo "SQL $arg" >> "$FAKE_LOG"
    exit 0
  fi
  prev="$arg"
done
cat > /dev/null
exit 0
`;

function topLevelMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && /^\d{4}_.+\.sql$/.test(e.name))
    .map((e) => e.name)
    .sort();
}

describe('scripts/migrate.sh ordering', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'migrate-runner-'));
    writeFileSync(join(dir, 'psql'), FAKE_PSQL);
    chmodSync(join(dir, 'psql'), 0o755);
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function run(applied: readonly string[]): Promise<{ log: string[]; stdout: string }> {
    const appliedFile = join(dir, 'applied.txt');
    const logFile = join(dir, 'log.txt');
    writeFileSync(appliedFile, applied.map((n) => `${n}\n`).join(''));
    writeFileSync(logFile, '');
    const { stdout } = await execFileAsync('sh', [SCRIPT], {
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH ?? ''}`,
        DATABASE_URL: 'postgres://fake/db',
        MIGRATIONS_DIR,
        FAKE_APPLIED: appliedFile,
        FAKE_LOG: logFile,
      },
    });
    const log = readFileSync(logFile, 'utf8')
      .split('\n')
      .filter((l) => l.length > 0);
    return { log, stdout };
  }

  it('applies 0022 on a database that already recorded 0027, and nothing else', async () => {
    const all = topLevelMigrations();
    expect(all).toContain('0022_envelope_documents.sql');
    expect(all).toContain('0027_signer_token_dispatch.sql');
    // Prod before WP-03: everything except 0022 (and any later WP's file).
    const prodApplied = all.filter(
      (n) => n <= '0027_signer_token_dispatch.sql' && !n.startsWith('0022_'),
    );

    const { log, stdout } = await run(prodApplied);

    const applied = log.filter((l) => l.startsWith('APPLY ')).map((l) => l.slice(6));
    const expected = all.filter((n) => !prodApplied.includes(n));
    expect(applied).toEqual(expected);
    expect(applied[0]).toBe('0022_envelope_documents.sql');
    expect(stdout).toContain('skip 0027_signer_token_dispatch.sql (already applied)');
    expect(log).toContain(
      "SQL insert into public.schema_migrations (filename) values ('0022_envelope_documents.sql')",
    );
  });

  it('is a no-op once every file is recorded', async () => {
    const { log } = await run(topLevelMigrations());
    expect(log.filter((l) => l.startsWith('APPLY '))).toEqual([]);
  });
});
