import { forwardRef } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '../Button';
import type { FlowHeaderProps } from './FlowHeader.types';
import {
  Left,
  Meta,
  Right,
  Root,
  StepItem,
  StepLabel,
  StepList,
  StepNum,
  StepSep,
  Title,
  TitleBlock,
} from './FlowHeader.styles';

/**
 * Header of the document flow (Upload, Prepare, Send): close button and
 * title on the left, the step track in the middle, actions on the right.
 * On phones the track becomes a thin segmented bar under the title.
 */
export const FlowHeader = forwardRef<HTMLElement, FlowHeaderProps>((props, ref) => {
  const { steps, onClose, closeLabel = 'Close', title, meta, children, ...rest } = props;
  return (
    <Root {...rest} ref={ref}>
      <Left>
        {onClose ? (
          <Button variant="ghost" iconOnly iconLeft={X} aria-label={closeLabel} onClick={onClose} />
        ) : null}
        {title ? (
          <TitleBlock>
            <Title>{title}</Title>
            {meta ? <Meta>{meta}</Meta> : null}
          </TitleBlock>
        ) : null}
      </Left>
      <StepList aria-label="Progress">
        {steps.map((step, i) => (
          <StepItem
            key={step.label}
            $state={step.state}
            aria-current={step.state === 'active' ? 'step' : undefined}
          >
            {i > 0 ? <StepSep aria-hidden /> : null}
            <StepNum $state={step.state} aria-hidden>
              {step.state === 'done' ? <Check size={12} strokeWidth={2.5} /> : i + 1}
            </StepNum>
            <StepLabel>{step.label}</StepLabel>
          </StepItem>
        ))}
      </StepList>
      <Right>{children}</Right>
    </Root>
  );
});

FlowHeader.displayName = 'FlowHeader';
