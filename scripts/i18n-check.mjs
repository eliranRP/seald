#!/usr/bin/env node
// i18n key check (WP-39). Fails when:
//   - a `t('key')` call (or `i18nKey="key"` on <Trans>) used in apps/web/src or
//     apps/api/src names a key missing from the English catalog
//     (packages/shared/locales/en/common.json), or
//   - the English catalog has a leaf key that no scanned source mentions.
// A key counts as used when it appears as a quoted string anywhere in the
// sources, so keys held in lookup tables (`{ signature: 'signing.x.y' }`)
// are covered. Template-literal keys (`t(\`prefix.${x}\`)`) cannot be checked
// statically; they mark every catalog key under their literal prefix as used.
// Tests and stories may name keys on purpose, so they count as usage only.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'packages/shared/locales/en/common.json');
const scanRoots = [join(root, 'apps/web/src'), join(root, 'apps/api/src')];
const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);
const TEST_FILE = /\.(test|spec|stories)\.[cm]?[jt]sx?$/;

// `t(` at a word boundary (so `it(`, `split(` do not match), with an optional
// leading locale argument (`t(locale, 'key')` in the API; an identifier or a
// quoted literal), then a quoted string or template literal.
const CALL = /\bt\(\s*(?:(?:[\w$.]+|'[^'\n]*'|"[^"\n]*")\s*,\s*)?(['"`])((?:(?!\1).)*?)\1/g;
// react-i18next <Trans i18nKey="..."> / i18nKey={'...'}.
const TRANS = /i18nKey=\{?\s*(['"])([^'"\n]+)\1/g;
// Any quoted token that could be a key.
const QUOTED = /(['"`])([A-Za-z][\w.:-]*)\1/g;
const KEY_SHAPE = /^[A-Za-z][\w.-]*(?::[A-Za-z][\w.-]*(?:\.[\w-]+)*)?$/;

/** @returns {string[]} dotted leaf paths of a nested catalog object */
function leafPaths(node, prefix = '') {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.push(path);
    else if (value && typeof value === 'object') out.push(...leafPaths(value, path));
  }
  return out;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SOURCE_EXT.test(entry) && !entry.endsWith('.d.ts')) files.push(full);
  }
  return files;
}

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const catalogKeys = new Set(leafPaths(catalog));
const commonPath = (key) => (key.includes(':') ? null : key);

const usedKeys = new Set();
const dynamicPrefixes = new Set();
const missing = [];

for (const dir of scanRoots) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    const isTest = TEST_FILE.test(file);
    const where = (index) => `${relative(root, file)}:${text.slice(0, index).split('\n').length}`;

    for (const quoted of text.matchAll(QUOTED)) {
      const path = commonPath(quoted[2]);
      if (path !== null && catalogKeys.has(path)) usedKeys.add(path);
    }

    const checkKey = (literal, index) => {
      if (!KEY_SHAPE.test(literal)) return;
      const path = commonPath(literal);
      if (path === null) return; // other namespaces are not catalogued here
      usedKeys.add(path);
      if (!catalogKeys.has(path) && !isTest) missing.push({ key: path, where: where(index) });
    };

    for (const match of text.matchAll(CALL)) {
      const [, quote, literal] = match;
      if (quote === '`') {
        if (literal.includes('${')) {
          const prefix = literal.slice(0, literal.indexOf('${'));
          if (prefix) dynamicPrefixes.add(prefix);
        } else {
          checkKey(literal, match.index);
        }
        continue;
      }
      checkKey(literal, match.index);
    }
    for (const match of text.matchAll(TRANS)) checkKey(match[2], match.index);
  }
}

const unused = [...catalogKeys].filter(
  (key) => !usedKeys.has(key) && ![...dynamicPrefixes].some((p) => key.startsWith(p)),
);

let failed = false;
if (missing.length > 0) {
  failed = true;
  console.error(`Missing from en catalog (${missing.length}):`);
  for (const { key, where } of missing) console.error(`  ${key}  (${where})`);
}
if (unused.length > 0) {
  failed = true;
  console.error(`Unused catalog keys (${unused.length}):`);
  for (const key of unused) console.error(`  ${key}`);
}
if (failed) {
  console.error('\ni18n:check failed.');
  process.exit(1);
}
console.log(
  `i18n:check ok: ${catalogKeys.size} catalog keys, ${usedKeys.size} referenced` +
    (dynamicPrefixes.size > 0 ? `, dynamic prefixes: ${[...dynamicPrefixes].join(', ')}` : ''),
);
