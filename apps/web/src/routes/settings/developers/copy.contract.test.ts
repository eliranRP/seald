import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNED = /\b(encrypt\w*|secure|e2ee|end-to-end|zero-knowledge)\b/i;
const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.resolve(here, '../../..');
const repoRoot = path.resolve(here, '../../../../../..');

function filesUnder(dir: string): string[] {
  if (!statSync(dir).isDirectory()) return [dir];
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...filesUnder(full));
      continue;
    }
    if (/\.(test|spec|stories)\./.test(entry)) continue;
    if (/\.(tsx|ts|html|txt)$/.test(entry)) found.push(full);
  }
  return found;
}

describe('access-key copy', () => {
  it('does not use banned marketing words in user-facing strings', () => {
    const roots = [
      path.join(webSrc, 'routes/settings/developers'),
      path.join(webSrc, 'routes/settings/SettingsIndexPage.tsx'),
      path.join(webSrc, 'components/SecretOnceSheet'),
      path.join(webSrc, 'components/Checkbox'),
      path.join(repoRoot, 'apps/api/src/email/templates/api_key_created'),
    ];
    const hits: string[] = [];
    for (const root of roots) {
      for (const file of filesUnder(root)) {
        const text = readFileSync(file, 'utf8');
        if (BANNED.test(text)) hits.push(path.relative(repoRoot, file));
      }
    }
    expect(hits).toEqual([]);
  });
});
