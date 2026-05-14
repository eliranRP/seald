import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression coverage for PR-7 (audit slice E — Landing):
 *   H (CSP breaks cookie-management buttons) — the strict prod CSP at
 *   apps/landing/public/_headers ships `script-src 'self' …` with no
 *   `'unsafe-inline'`, so inline `onclick=` handlers in markup are
 *   silently dropped at runtime. Pin "no inline onclick anywhere in
 *   apps/landing/src/**" so a future regression that re-adds one
 *   (which would break the "Manage cookie preferences" entry point and
 *   re-open the EDPB 03/2022 / CPRA §7026 same-ease-withdrawal
 *   violation) fails at unit-test time.
 *
 * The matching wiring lives in apps/landing/public/scripts/cookie-consent.js
 * via `attachBannerDelegate()` — a delegated click listener on
 * `[data-action="open-cookie-banner"]`.
 */

const LANDING_SRC = resolve(__dirname, '../../../landing/src');

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full, files);
    } else if (/\.(astro|html)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

describe('Landing — no inline onclick handlers (PR-7 H · CSP)', () => {
  it('no .astro / .html under apps/landing/src ships an `onclick=` attribute', () => {
    const violations: Array<{ file: string; line: number; text: string }> = [];
    for (const file of walk(LANDING_SRC)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((text, idx) => {
        // Match the HTML attribute form only — not phrases like "on
        // click" in prose. Allow surrounding whitespace + an `=`.
        if (/\sonclick\s*=/i.test(text)) {
          violations.push({ file, line: idx + 1, text: text.trim() });
        }
      });
    }
    expect(
      violations,
      `Inline onclick handlers found (CSP-strict pages will silently drop them):\n` +
        violations.map((v) => `  ${v.file}:${v.line} → ${v.text}`).join('\n'),
    ).toEqual([]);
  });

  it('the cookie-consent delegate wiring is shipped in cookie-consent.js', () => {
    const path = resolve(__dirname, '../../../landing/public/scripts/cookie-consent.js');
    const source = readFileSync(path, 'utf8');
    // Both: the delegate must be installed AND must read the
    // `data-action` attribute the markup carries.
    expect(source).toMatch(/data-action.{0,4}open-cookie-banner/);
    expect(source).toMatch(/addEventListener\(\s*['"]click['"]/);
  });
});
