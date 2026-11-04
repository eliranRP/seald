import { forwardRef, useId } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import styled from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import type { ButtonProps } from './Button.types';
import { ButtonRoot } from './Button.styles';

const Reason = styled.span`
  ${visuallyHidden}
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    fullWidth = false,
    iconOnly = false,
    disabled,
    disabledReason,
    onClick,
    children,
    type,
    title,
    'aria-describedby': describedBy,
    ...rest
  } = props;
  const reasonId = useId();
  const isInert = disabled || loading;
  // A disabled button with a reason stays focusable: aria-disabled only, so
  // Tab reaches it and the tooltip / description can explain why (UX rules:
  // feedback-and-states § 16).
  const explained = Boolean(disabled && disabledReason);
  // Canvas: `.btn-sm` icons are 14px, an icon-only 44/48px button carries a 20px glyph.
  let iconSize = 16;
  if (size === 'sm') iconSize = 14;
  else if (iconOnly) iconSize = 20;

  let leftSlot: ReactNode = null;
  if (loading) leftSlot = <Spinner size={size === 'sm' ? 'sm' : 'md'} />;
  else if (iconLeft) leftSlot = <Icon icon={iconLeft} size={iconSize} />;

  // An inert button swallows the click, including the implicit form submit
  // a `type="submit"` button would otherwise still fire while loading.
  const handleClick = isInert
    ? (event: MouseEvent<HTMLButtonElement>): void => {
        event.preventDefault();
      }
    : onClick;

  const button = (
    <ButtonRoot
      ref={ref}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      $iconOnly={iconOnly}
      {...rest}
      type={type ?? 'button'}
      disabled={explained ? undefined : disabled}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      aria-describedby={explained ? [describedBy, reasonId].filter(Boolean).join(' ') : describedBy}
      title={explained ? disabledReason : title}
      onClick={handleClick}
    >
      {leftSlot}
      {children}
      {iconRight ? <Icon icon={iconRight} size={iconSize} /> : null}
    </ButtonRoot>
  );

  if (!explained) return button;
  return (
    <>
      {button}
      <Reason id={reasonId}>{disabledReason}</Reason>
    </>
  );
});

Button.displayName = 'Button';
