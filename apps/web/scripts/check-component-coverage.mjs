/**
 * Fail when a top-level folder in src/components has no test or no story.
 * Names in component-coverage.allowlist are the current gaps; the testing
 * cycle removes them. Do not add names.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const componentsRoot = path.resolve(here, '../src/components');
const allowFile = path.resolve(here, 'component-coverage.allowlist');

function readAllowlist() {
  const text = fs.readFileSync(allowFile, 'utf8');
  return text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line.length > 0);
}

function treeHas(dir, pattern) {
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (pattern.test(entry.name)) return true;
    }
  }
  return false;
}

const allow = new Set(readAllowlist());
const folders = fs
  .readdirSync(componentsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const missing = [];
const stale = [];

for (const name of folders) {
  const dir = path.join(componentsRoot, name);
  const hasTest = treeHas(dir, /\.test\.tsx?$/);
  const hasStory = treeHas(dir, /\.stories\.tsx?$/);
  const gaps = [];
  if (!hasTest) gaps.push('test');
  if (!hasStory) gaps.push('story');
  if (gaps.length === 0) {
    if (allow.has(name)) stale.push(name);
    continue;
  }
  if (!allow.has(name)) missing.push(`${name} (missing ${gaps.join(' and ')})`);
}

for (const name of allow) {
  if (!folders.includes(name)) stale.push(`${name} (not a component folder)`);
}

if (missing.length > 0 || stale.length > 0) {
  if (missing.length > 0) {
    console.error('Component folders missing a test or story:');
    for (const line of missing) console.error(`  ${line}`);
  }
  if (stale.length > 0) {
    console.error('Remove these from scripts/component-coverage.allowlist:');
    for (const line of stale) console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log(`component coverage: ${folders.length} folders, ${allow.size} allowlisted`);
