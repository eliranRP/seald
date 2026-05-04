import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Bug G (Phase 6.A iter-2 PROD, 2026-05-04). The OAuth-callback popup
// lands at `/oauth/gdrive/callback?connected=1`. If `/oauth/` is missing
// from `apps/landing/_worker.js` SPA_PREFIXES, CF Pages serves the
// landing shell instead of rewriting to /app — same outage class as
// 2026-05-02 (`/m/`, `/templates`). This pin prevents that regression.

const WORKER_PATH = resolve(__dirname, '../../../../landing/_worker.js');

describe('apps/landing/_worker.js — /oauth/ SPA prefix coverage (Bug G)', () => {
  const source = readFileSync(WORKER_PATH, 'utf8');

  it('includes /oauth/ in SPA_PREFIXES so /oauth/gdrive/callback is rewritten to /app', () => {
    expect(source).toMatch(/SPA_PREFIXES\s*=\s*\[/);
    expect(source).toContain("'/oauth/'");
  });
});
