import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import type { ButtonProps } from './Button.types';
import { ButtonRoot } from './Button.styles';

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
    onClick,
    children,
    type,
    ...rest
  } = props;
  const isInert = disabled || loading;
  // Canvas: `.btn-sm` icons are 14px, an icon-only 44/48px button carries a 20px glyph.
  let iconSize = 16;
  if (size === 'sm') iconSize = 14;
  else if (iconOnly) iconSize = 20;

  let leftSlot: ReactNode = null;
  if (loading) leftSlot = <Spinner size={size === 'sm' ? 'sm' : 'md'} />;
  else if (iconLeft) leftSlot = <Icon icon={iconLeft} size={iconSize} />;

  return (
    <ButtonRoot
      ref={ref}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
      $iconOnly={iconOnly}
      {...rest}
      type={type ?? 'button'}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      onClick={isInert ? undefined : onClick}
    >
      {leftSlot}
      {children}
      {iconRight ? <Icon icon={iconRight} size={iconSize} /> : null}
    </ButtonRoot>
  );
});

Button.displayName = 'Button';
