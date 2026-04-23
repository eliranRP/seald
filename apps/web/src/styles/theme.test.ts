import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { seald } from './theme';

const css = readFileSync(resolve(__dirname, './tokens.css'), 'utf8');

function extract(name: string): string {
  const m = css.match(new RegExp(`--${name}\\b:\\s*([^;]+);`));
  if (!m?.[1]) throw new Error(`Missing --${name} in tokens.css`);
  return m[1].trim();
}

describe('theme.ts ↔ tokens.css parity', () => {
  it.each([
    ['ink-900', seald.color.ink[900]],
    ['ink-700', seald.color.ink[700]],
    ['ink-500', seald.color.ink[500]],
    ['ink-50', seald.color.ink[50]],
    ['indigo-600', seald.color.indigo[600]],
    ['indigo-700', seald.color.indigo[700]],
    ['success-500', seald.color.success[500]],
    ['warn-500', seald.color.warn[500]],
    ['danger-500', seald.color.danger[500]],
    ['info-500', seald.color.info[500]],
  ])('palette %s matches', (name, expected) => {
    expect(extract(name).toUpperCase()).toBe(expected.toUpperCase());
  });

  it('semantic fg/bg/border/accent tokens route through CSS vars', () => {
    expect(seald.color.fg[1]).toBe('var(--fg-1)');
    expect(seald.color.bg.app).toBe('var(--bg-app)');
    expect(seald.color.border.focus).toBe('var(--border-focus)');
    expect(seald.color.accent.base).toBe('var(--accent)');
  });
});
