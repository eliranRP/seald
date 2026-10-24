import { forwardRef } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '../Button';
import type { FlowHeaderProps } from './FlowHeader.types';
import { useFocusedShell } from '@/layout/shellChrome';
import {
  Left,
  Logo,
  LogoMark,
  LogoWord,
  Meta,
  MobileTitle,
  Right,
  Root,
  StepCount,
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
 * title (or the Seald logo) on the left, the step track in the middle,
 * actions on the right. On phones the row is the 56px `.m-top` bar (title
 * only, or `mobileTitle` with an "n/N" step count) and the track becomes a
 * thin segmented bar under it.
 */
export const FlowHeader = forwardRef<HTMLElement, FlowHeaderProps>((props, ref) => {
  // The flow header replaces the app top bar (design: Upload / Prepare).
  useFocusedShell();
  const {
    steps,
    onClose,
    closeLabel = 'Close',
    title,
    meta,
    mobileTitle,
    children,
    ...rest
  } = props;
  const activeIndex = steps.findIndex((s) => s.state === 'active');
  const hasActions = children !== undefined && children !== null;
  return (
    <Root {...rest} ref={ref} $padBar={title !== undefined}>
      <Left>
        {onClose ? (
          <Button variant="ghost" iconOnly iconLeft={X} aria-label={closeLabel} onClick={onClose} />
        ) : null}
        {title ? (
          <TitleBlock>
            <Title>{title}</Title>
            {meta ? <Meta>{meta}</Meta> : null}
          </TitleBlock>
        ) : (
          <Logo aria-hidden>
            <LogoMark>S</LogoMark>
            <LogoWord>Seald</LogoWord>
          </Logo>
        )}
        {/* Visual only: the page keeps its own (visually hidden) h1. */}
        {!title && mobileTitle ? <MobileTitle aria-hidden>{mobileTitle}</MobileTitle> : null}
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
      <Right>
        {children}
        {!hasActions && activeIndex >= 0 ? (
          <StepCount aria-hidden>{`${String(activeIndex + 1)}/${String(steps.length)}`}</StepCount>
        ) : null}
      </Right>
    </Root>
  );
});

FlowHeader.displayName = 'FlowHeader';
