import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Icon } from '../Icon';
import type { ButtonProps } from './Button.types';
import { ButtonRoot, Spinner } from './Button.styles';

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    loading = false,
    fullWidth = false,
    disabled,
    onClick,
    children,
    type,
    ...rest
  } = props;
  const isInert = disabled || loading;
  const iconSize = size === 'sm' ? 16 : 20;

  let leftSlot: ReactNode = null;
  if (loading) leftSlot = <Spinner aria-hidden />;
  else if (iconLeft) leftSlot = <Icon icon={iconLeft} size={iconSize} />;

  return (
    <ButtonRoot
      ref={ref}
      $variant={variant}
      $size={size}
      $fullWidth={fullWidth}
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
