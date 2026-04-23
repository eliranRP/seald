import { forwardRef } from 'react';
import type { Ref } from 'react';
import type { CardProps } from './Card.types';
import { CardRoot } from './Card.styles';

export const Card = forwardRef<HTMLElement, CardProps>((props, ref) => {
  const { elevated = false, padding = 6, children, ...rest } = props;
  const isLabelled = Boolean(rest['aria-label'] || rest['aria-labelledby']);
  const tag: 'section' | 'div' = isLabelled ? 'section' : 'div';
  return (
    <CardRoot
      $elevated={elevated}
      $padding={padding}
      {...rest}
      as={tag}
      ref={ref as Ref<HTMLElement>}
    >
      {children}
    </CardRoot>
  );
});
Card.displayName = 'Card';
