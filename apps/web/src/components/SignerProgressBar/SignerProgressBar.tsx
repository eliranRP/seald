import { forwardRef } from 'react';
import type { SignerProgressBarProps } from './SignerProgressBar.types';
import { Segment, Track } from './SignerProgressBar.styles';

/**
 * Segmented pill that shows per-signer progress at a glance. Each
 * signer gets an equal-width segment colored by its status; pending /
 * draft stays transparent so the bar reads "N done of M total".
 */
export const SignerProgressBar = forwardRef<HTMLDivElement, SignerProgressBarProps>(
  function SignerProgressBar(props, ref) {
    const { signers, ...rest } = props;
    const total = signers.length;
    const signed = signers.filter((s) => s.status === 'signed').length;
    return (
      <Track
        ref={ref}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={signed}
        aria-label={rest['aria-label'] ?? `${signed} of ${total} signers complete`}
        {...rest}
      >
        {signers.map((s) => (
          <Segment key={s.id} $status={s.status} />
        ))}
      </Track>
    );
  },
);
SignerProgressBar.displayName = 'SignerProgressBar';
