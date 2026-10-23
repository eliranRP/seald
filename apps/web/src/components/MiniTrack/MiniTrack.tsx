import { forwardRef } from 'react';
import { Check, X } from 'lucide-react';
import { Icon } from '../Icon';
import type { MiniTrackProps, MiniTrackState } from './MiniTrack.types';
import { Dot, Line, StepItem, StepLabel, TrackRoot } from './MiniTrack.styles';

const SPOKEN: Record<MiniTrackState, string> = {
  done: 'done',
  now: 'in progress',
  bad: 'failed',
  off: 'skipped',
  todo: 'not yet',
};

/**
 * L1 primitive — compact per-signer track (canvas `.mtrack`): one dot per
 * step joined by short lines. Each step's state is spoken ("Opened: in
 * progress"), never carried by colour alone.
 */
export const MiniTrack = forwardRef<HTMLOListElement, MiniTrackProps>((props, ref) => {
  const { steps, ...rest } = props;
  return (
    <TrackRoot ref={ref} {...rest}>
      {steps.map((step, index) => (
        <StepItem key={step.label}>
          {index > 0 ? <Line $done={step.state === 'done'} aria-hidden /> : null}
          <Dot $state={step.state} data-state={step.state} aria-hidden>
            {step.state === 'done' ? <Icon icon={Check} size={12} /> : null}
            {step.state === 'bad' ? <Icon icon={X} size={12} /> : null}
          </Dot>
          <StepLabel>{`${step.label}: ${SPOKEN[step.state]}`}</StepLabel>
        </StepItem>
      ))}
    </TrackRoot>
  );
});
MiniTrack.displayName = 'MiniTrack';
