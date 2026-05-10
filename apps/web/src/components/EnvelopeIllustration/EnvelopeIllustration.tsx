import { forwardRef } from 'react';
import type { SVGProps } from 'react';

export interface EnvelopeIllustrationProps extends SVGProps<SVGSVGElement> {
  /** Outer width in px. Height scales to preserve the 160:110 ratio. */
  readonly size?: number;
}

/**
 * Static envelope illustration — same visual treatment as the
 * `SendingOverlay`'s in-flight envelope (gradient body + lifted flap)
 * but without the wax-seal, shimmer, or any animation. Used as the
 * placeholder graphic for empty list states (dashboard "no
 * envelopes match", future templates / contacts blank states).
 *
 * The SVG is fully self-contained — no theme-tokens — so it renders
 * identically in light + dark and inside surfaces with arbitrary
 * background colors.
 */
export const EnvelopeIllustration = forwardRef<SVGSVGElement, EnvelopeIllustrationProps>(
  (props, ref) => {
    const { size = 120, ...rest } = props;
    const height = Math.round(size * (110 / 160));
    return (
      <svg
        ref={ref}
        viewBox="0 0 160 110"
        width={size}
        height={height}
        role="img"
        aria-label="Envelope"
        {...rest}
      >
        <defs>
          <linearGradient id="ei-body" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#F8FAFC" />
            <stop offset="1" stopColor="#EEF2FF" />
          </linearGradient>
          <linearGradient id="ei-flap" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#FFFFFF" />
            <stop offset="1" stopColor="#E0E7FF" />
          </linearGradient>
        </defs>
        <rect x="8" y="18" width="144" height="84" rx="8" fill="url(#ei-body)" stroke="#C7D2FE" />
        <path d="M8 26 L80 70 L152 26" fill="none" stroke="#A5B4FC" strokeWidth="1.2" />
        <path
          d="M8 26 L80 2 L152 26 L152 34 L80 12 L8 34 Z"
          fill="url(#ei-flap)"
          stroke="#C7D2FE"
        />
      </svg>
    );
  },
);
EnvelopeIllustration.displayName = 'EnvelopeIllustration';
