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
    ['tag-pink-50', seald.color.tag.pink[50]],
    ['tag-pink-500', seald.color.tag.pink[500]],
    ['tag-pink-700', seald.color.tag.pink[700]],
    ['tag-violet-500', seald.color.tag.violet[500]],
    ['tag-cyan-500', seald.color.tag.cyan[500]],
    ['google-blue', seald.color.brand.google.blue],
    ['drive-green', seald.color.brand.drive.green],
    ['success-200', seald.color.success[200]],
    ['success-400', seald.color.success[400]],
    ['danger-200', seald.color.danger[200]],
    ['danger-800', seald.color.danger[800]],
    ['fg-on-accent', seald.color.fgOnAccent],
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

describe('v2 type, radius and motion tokens', () => {
  it.each([
    ['fs-badge', seald.font.size.badge],
    ['fs-micro', seald.font.size.micro],
    ['fs-xs', seald.font.size.xs],
    ['fs-caption', seald.font.size.caption],
    ['fs-sm', seald.font.size.bodySm],
    ['fs-body', seald.font.size.bodyMd],
    ['fs-md', seald.font.size.body],
    ['fs-lg', seald.font.size.lg],
    ['fs-xl', seald.font.size.xl],
    ['fs-2xl', seald.font.size.x2l],
    ['fs-3xl', seald.font.size.x3l],
    ['fs-4xl', seald.font.size.x4l],
    ['fs-5xl', seald.font.size.x5l],
    ['fs-code', seald.font.size.code],
    ['r-hair', seald.radius.hair],
    ['r-2xs', seald.radius.xxs],
    ['r-md', seald.radius.md],
    ['dur-instant', seald.motion.durInstant],
    ['dur-enter', seald.motion.durEnter],
    ['dur-exit', seald.motion.durExit],
    ['ease-out', seald.motion.easeOut],
    ['ease-in', seald.motion.easeIn],
    ['ease-spring', seald.motion.easeSpring],
    ['stagger', seald.motion.stagger],
  ])('--%s matches theme', (name, expected) => {
    expect(extract(name)).toBe(expected);
  });

  it.each([
    ['fw-regular', seald.font.weight.regular],
    ['fw-medium', seald.font.weight.medium],
    ['fw-semibold', seald.font.weight.semibold],
    ['fw-bold', seald.font.weight.bold],
  ])('--%s matches theme', (name, expected) => {
    expect(Number(extract(name))).toBe(expected);
  });
});
