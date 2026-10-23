import { css } from 'styled-components';

/**
 * Seald motion system (redesign v2 — canvas `seald.css` section 31).
 *
 * Rules:
 *  - enter with `theme.motion.easeOut`, leave with `easeIn`, success with
 *    `easeSpring`;
 *  - only opacity + transform (individual `translate` / `scale`) animate;
 *  - lists stagger by `theme.motion.stagger`, capped at 8 items;
 *  - everything collapses under `prefers-reduced-motion` (GlobalStyles).
 *
 * The keyframes live once in `GlobalStyles` under the names below so plain
 * CSS can use them too. These helpers are the only way components should
 * reference them:
 *
 * ```ts
 * const Row = styled.li<{ $index: number }>`
 *   ${rise}
 *   ${({ $index }) => stagger($index)}
 * `;
 * ```
 */
export const MOTION_KEYFRAMES = {
  screenIn: 'seald-screen-in',
  fadeIn: 'seald-fade-in',
  rise: 'seald-rise',
  pop: 'seald-pop',
  drop: 'seald-drop',
  sheetUp: 'seald-sheet-up',
  toastIn: 'seald-toast-in',
  barDown: 'seald-bar-down',
  spring: 'seald-spring',
  ring: 'seald-ring',
  growX: 'seald-grow-x',
  shimmer: 'seald-shimmer',
  spin: 'seald-spin',
  newFade: 'seald-new-fade',
} as const;

export type MotionKeyframe = (typeof MOTION_KEYFRAMES)[keyof typeof MOTION_KEYFRAMES];

/** Main column of a screen easing in on navigation. */
export const screenEnter = css`
  animation: ${MOTION_KEYFRAMES.screenIn} ${({ theme }) => theme.motion.durEnter}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Plain fade (scrims, secondary panels). */
export const fadeIn = css`
  animation: ${MOTION_KEYFRAMES.fadeIn} ${({ theme }) => theme.motion.durBase}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** List rows / cards rising into place. Pair with `stagger(index)`. */
export const rise = css`
  animation: ${MOTION_KEYFRAMES.rise} ${({ theme }) => theme.motion.durEnter}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Max stagger steps — the 8th item and later share the last delay. */
export const STAGGER_CAP = 7;

/**
 * Animation delay for the item at `index` (0-based):
 * `min(index, 7) × theme.motion.stagger`.
 */
export function stagger(index: number) {
  const step = Math.max(0, Math.min(Math.floor(index), STAGGER_CAP));
  return css`
    animation-delay: calc(${({ theme }) => theme.motion.stagger} * ${step});
  `;
}

/** Modal / dialog card popping in. */
export const pop = css`
  animation: ${MOTION_KEYFRAMES.pop} ${({ theme }) => theme.motion.durEnter}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Dropdown menu dropping from its trigger. */
export const drop = css`
  transform-origin: top right;
  animation: ${MOTION_KEYFRAMES.drop} ${({ theme }) => theme.motion.durBase}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Bottom sheet sliding up from the viewport edge. */
export const sheetUp = css`
  animation: ${MOTION_KEYFRAMES.sheetUp} ${({ theme }) => theme.motion.durEnter}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Toast arriving with a slight spring. */
export const toastIn = css`
  animation: ${MOTION_KEYFRAMES.toastIn} ${({ theme }) => theme.motion.durEnter}
    ${({ theme }) => theme.motion.easeSpring} both;
`;

/** Full-width bar (offline, session) sliding down from the top. */
export const barDown = css`
  animation: ${MOTION_KEYFRAMES.barDown} ${({ theme }) => theme.motion.durBase}
    ${({ theme }) => theme.motion.easeOut} both;
`;

/** Success marks springing in. */
export const spring = css`
  animation: ${MOTION_KEYFRAMES.spring} 420ms ${({ theme }) => theme.motion.easeSpring} both;
`;

/** Attention ring pulsing around the "current" step dot. */
export const ring = css`
  animation: ${MOTION_KEYFRAMES.ring} 1.6s ${({ theme }) => theme.motion.easeOut} infinite;
`;

/** Progress fill growing from the left. */
export const growX = css`
  transform-origin: left;
  animation: ${MOTION_KEYFRAMES.growX} 600ms ${({ theme }) => theme.motion.easeOut} both;
`;

/** Press feedback: scales to .97 on :active (not when disabled). */
export const pressable = css`
  transition:
    background-color ${({ theme }) => theme.motion.durFast}
      ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    scale ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  &:active:not(:disabled):not([aria-disabled='true']) {
    scale: 0.97;
    transition-duration: ${({ theme }) => theme.motion.durInstant};
  }
`;

/** Interactive card lifting 2px with a medium shadow on hover. */
export const hoverLift = css`
  transition:
    translate ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut},
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  &:hover {
    translate: 0 -2px;
    box-shadow: ${({ theme }) => theme.shadow.md};
  }
`;
