#!/usr/bin/env node
// i18n key check (WP-39). Fails when:
//   - a `t('key')` literal used in apps/web/src or apps/api/src has no entry in
//     the English catalog (packages/shared/locales/en/common.json), or
//   - the English catalog has a leaf key that no scanned source uses.
// Template-literal keys (`t(\`prefix.${x}\`)`) cannot be checked statically;
// they mark every catalog key under their literal prefix as used.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'packages/shared/locales/en/common.json');
const scanRoots = [join(root, 'apps/web/src'), join(root, 'apps/api/src')];
const SOURCE_EXT = /\.(ts|tsx)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

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

// `t(` at a word boundary (so `it(`, `split(` do not match), with an optional
// leading locale argument (`t(locale, 'key')` in the API; an identifier or a
// quoted literal), then a quoted string or template literal.
const CALL = /\bt\(\s*(?:(?:[\w$.]+|'[^'\n]*'|"[^"\n]*")\s*,\s*)?(['"`])((?:(?!\1).)*?)\1/g;
// Tests and stories may use keys on purpose (e.g. to check a miss), so they
// count as usage but are never reported as missing.
const TEST_FILE = /\.(test|spec|stories)\.[cm]?[jt]sx?$/;
const KEY_SHAPE = /^[A-Za-z][\w.-]*(?::[A-Za-z][\w.-]*(?:\.[\w-]+)*)?$/;

const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
const catalogKeys = new Set(leafPaths(catalog));

const usedKeys = new Map(); // key -> first "file:line"
const dynamicPrefixes = new Set();
const missing = [];

for (const dir of scanRoots) {
  for (const file of walk(dir)) {
    const text = readFileSync(file, 'utf8');
    CALL.lastIndex = 0;
    let match;
    while ((match = CALL.exec(text)) !== null) {
      const [, quote, literal] = match;
      const where = `${relative(root, file)}:${text.slice(0, match.index).split('\n').length}`;
      if (quote === '`') {
        if (literal.includes('${')) {
          const prefix = literal.slice(0, literal.indexOf('${'));
          if (prefix) dynamicPrefixes.add(prefix);
        } else if (KEY_SHAPE.test(literal)) {
          usedKeys.set(literal, usedKeys.get(literal) ?? where);
        }
        continue;
      }
      if (!KEY_SHAPE.test(literal)) continue;
      const path = literal.includes(':') ? literal.slice(literal.indexOf(':') + 1) : literal;
      const ns = literal.includes(':') ? literal.slice(0, literal.indexOf(':')) : 'common';
      if (ns !== 'common') continue; // only the common namespace exists today
      usedKeys.set(path, usedKeys.get(path) ?? where);
      if (!catalogKeys.has(path) && !TEST_FILE.test(file)) missing.push({ key: path, where });
    }
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
  `i18n:check ok: ${catalogKeys.size} catalog keys, ${usedKeys.size} literal keys used` +
    (dynamicPrefixes.size > 0 ? `, dynamic prefixes: ${[...dynamicPrefixes].join(', ')}` : ''),
);
