import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// WT-B watchpoint #2 / red-flag row 1: the production outage on 2026-05-02
// was caused by SPA routes missing from `apps/landing/_worker.js`. CF
// Pages then served the landing shell instead of rewriting to /app, and
// the SPA never booted at the affected paths. Adding `/settings/` to
// SPA_PREFIXES is the WT-B fix; this test pins it so a future refactor
// that drops the prefix fails CI before it can ship.

const WORKER_PATH = resolve(__dirname, '../../../../../landing/_worker.js');

describe('apps/landing/_worker.js — SPA prefix coverage', () => {
  const source = readFileSync(WORKER_PATH, 'utf8');

  it('includes /settings/ in SPA_PREFIXES so /settings/integrations is rewritten to /app', () => {
    // Match the SPA_PREFIXES literal array in the worker. The worker is
    // single-file and a static literal, so a string match is sufficient
    // and robust against minor whitespace edits.
    expect(source).toMatch(/SPA_PREFIXES\s*=\s*\[/);
    expect(source).toContain("'/settings/'");
  });

  it('continues to cover the previously regressed mobile + auth prefixes', () => {
    // Defensive — pin the existing entries so a careless edit can't drop
    // them on the same line as adding the new one.
    for (const prefix of [
      '/auth/',
      '/debug/',
      '/verify/',
      '/sign/',
      '/document/',
      '/templates/',
      '/m/',
    ]) {
      expect(source).toContain(`'${prefix}'`);
    }
  });
});
