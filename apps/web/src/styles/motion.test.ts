import { describe, expect, it } from 'vitest';
import { seald } from './theme';
import {
  MOTION_KEYFRAMES,
  STAGGER_CAP,
  barDown,
  drop,
  fadeIn,
  growX,
  hoverLift,
  pop,
  pressable,
  ring,
  rise,
  screenEnter,
  sheetUp,
  spring,
  stagger,
  toastIn,
} from './motion';

/** Resolve a styled-components `css` rule set against the Seald theme. */
function flatten(chunk: unknown): string {
  if (Array.isArray(chunk)) return chunk.map(flatten).join('');
  if (typeof chunk === 'function') return flatten(chunk({ theme: seald }));
  if (chunk === null || chunk === undefined || chunk === false) return '';
  return String(chunk);
}

const squash = (rules: unknown): string => flatten(rules).replace(/\s+/g, ' ');

describe('motion helpers', () => {
  it.each([
    [
      'screenEnter',
      screenEnter,
      MOTION_KEYFRAMES.screenIn,
      seald.motion.durEnter,
      seald.motion.easeOut,
    ],
    ['fadeIn', fadeIn, MOTION_KEYFRAMES.fadeIn, seald.motion.durBase, seald.motion.easeOut],
    ['rise', rise, MOTION_KEYFRAMES.rise, seald.motion.durEnter, seald.motion.easeOut],
    ['pop', pop, MOTION_KEYFRAMES.pop, seald.motion.durEnter, seald.motion.easeOut],
    ['drop', drop, MOTION_KEYFRAMES.drop, seald.motion.durBase, seald.motion.easeOut],
    ['sheetUp', sheetUp, MOTION_KEYFRAMES.sheetUp, seald.motion.durEnter, seald.motion.easeOut],
    ['toastIn', toastIn, MOTION_KEYFRAMES.toastIn, seald.motion.durEnter, seald.motion.easeSpring],
    ['barDown', barDown, MOTION_KEYFRAMES.barDown, seald.motion.durBase, seald.motion.easeOut],
  ])('%s animates its keyframe with theme duration + easing', (_name, rules, frame, dur, ease) => {
    const out = squash(rules);
    expect(out).toContain(`animation: ${frame} ${dur} ${ease} both`);
  });

  it.each([
    ['spring', spring, MOTION_KEYFRAMES.spring, seald.motion.easeSpring],
    ['ring', ring, MOTION_KEYFRAMES.ring, seald.motion.easeOut],
    ['growX', growX, MOTION_KEYFRAMES.growX, seald.motion.easeOut],
  ])('%s uses its keyframe and theme easing', (_name, rules, frame, ease) => {
    const out = squash(rules);
    expect(out).toContain(frame);
    expect(out).toContain(ease);
  });

  it('stagger multiplies the theme step and caps at 8 items', () => {
    expect(squash(stagger(0))).toContain(`calc(${seald.motion.stagger} * 0)`);
    expect(squash(stagger(3))).toContain(`calc(${seald.motion.stagger} * 3)`);
    expect(squash(stagger(42))).toContain(`calc(${seald.motion.stagger} * ${STAGGER_CAP})`);
    expect(squash(stagger(-2))).toContain(`calc(${seald.motion.stagger} * 0)`);
  });

  it('pressable scales to .97 with the instant duration, skipping disabled', () => {
    const out = squash(pressable);
    expect(out).toContain('scale: 0.97');
    expect(out).toContain(`transition-duration: ${seald.motion.durInstant}`);
    expect(out).toContain(":not(:disabled):not([aria-disabled='true'])");
  });

  it('hoverLift translates up 2px with the medium shadow', () => {
    const out = squash(hoverLift);
    expect(out).toContain('translate: 0 -2px');
    expect(out).toContain(`box-shadow: ${seald.shadow.md}`);
    expect(out).toContain(seald.motion.easeOut);
  });
});
