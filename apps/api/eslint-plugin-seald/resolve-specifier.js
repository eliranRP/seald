'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CODE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts']);

/**
 * `.service` and `.repository` are not JavaScript extensions. `path.extname`
 * would treat them as one and skip the `.ts` file on disk.
 */
function codeExtension(filePath) {
  const ext = path.extname(filePath);
  return CODE_EXTENSIONS.has(ext) ? ext : '';
}

function bareModuleName(filePath) {
  const base = path.basename(filePath);
  const ext = codeExtension(filePath);
  return ext ? base.slice(0, -ext.length) : base;
}

function isFile(candidate) {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function apiRootFrom(filename) {
  const normalized = path.resolve(filename);
  const marker = `${path.sep}apps${path.sep}api${path.sep}`;
  const idx = normalized.lastIndexOf(marker);
  if (idx === -1) return null;
  return normalized.slice(0, idx + marker.length - 1);
}

function isInside(file, dir) {
  const rel = path.relative(dir, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * Resolve a relative specifier from `fromFile`. A `.js` import maps to the
 * sibling `.ts` when that file exists, so `envelopes.service.js` is the
 * service on disk. When nothing is on disk, the logical `.ts` path is still
 * returned so a new `*.service.ts` can be classified by basename.
 */
function resolveRelative(fromFile, specifier) {
  const base = path.resolve(path.dirname(fromFile), specifier);
  const ext = codeExtension(base);
  const candidates = [];
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.jsx') {
    const stem = base.slice(0, -ext.length);
    candidates.push(`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`, base);
  } else if (ext) {
    candidates.push(base);
  } else {
    candidates.push(
      `${base}.ts`,
      `${base}.tsx`,
      `${base}.mts`,
      `${base}.cts`,
      path.join(base, 'index.ts'),
      path.join(base, 'index.tsx'),
      `${base}.js`,
      `${base}.jsx`,
      `${base}.mjs`,
      `${base}.cjs`,
    );
  }
  for (const candidate of candidates) {
    if (isFile(candidate)) return candidate;
  }
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.jsx') {
    return `${base.slice(0, -ext.length)}.ts`;
  }
  if (!ext) return `${base}.ts`;
  return base;
}

function isTestTarget(filePath) {
  const name = path.basename(filePath);
  if (/\.(spec|test)\.(ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(name)) return true;
  return filePath.split(path.sep).some((part) => part === '__tests__' || part === '__mocks__');
}

function isServiceModule(filePath) {
  return bareModuleName(filePath).endsWith('.service');
}

function namesRepository(specifier) {
  return bareModuleName(specifier).endsWith('.repository');
}

module.exports = {
  apiRootFrom,
  bareModuleName,
  isInside,
  isServiceModule,
  isTestTarget,
  namesRepository,
  resolveRelative,
};
