import { forwardRef } from 'react';
import { useTheme } from 'styled-components';
import type { SignatureMarkProps } from './SignatureMark.types';
import { Mark, Script } from './SignatureMark.styles';

export const SignatureMark = forwardRef<HTMLDivElement, SignatureMarkProps>((props, ref) => {
  const { name, size = 44, underline = true, tone = 'ink', ...rest } = props;
  const theme = useTheme();
  const width = Math.max(120, name.length * size * 0.28);
  return (
    <Mark {...rest} ref={ref} aria-hidden>
      <Script $size={size} $tone={tone}>
        {name}
      </Script>
      {underline ? (
        <svg width={width} height={6} style={{ display: 'block', marginTop: -2 }}>
          <path
            d={`M4 3 Q ${size} -1 ${size * 2} 3 T ${width - 6} 3`}
            stroke={theme.color.indigo[600]}
            strokeWidth={1.75}
            fill="none"
            strokeLinecap="round"
            opacity={0.55}
          />
        </svg>
      ) : null}
    </Mark>
  );
});
SignatureMark.displayName = 'SignatureMark';
