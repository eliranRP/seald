import { forwardRef } from 'react';
import { Icon } from '../Icon';
import type { StatePageProps } from './StatePage.types';
import { Body, Code, Description, IconCircle, Root, Title } from './StatePage.styles';

/**
 * L1 primitive — centred status page (canvas `.state-page`): a round icon or a
 * big quiet numeral, a serif title, one muted line and the actions. Used by
 * the 404, the error fallback and the maintenance page.
 */
export const StatePage = forwardRef<HTMLDivElement, StatePageProps>((props, ref) => {
  const { icon, tone = 'neutral', code, title, description, children, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      {code ? <Code aria-hidden>{code}</Code> : null}
      {!code && icon ? (
        <IconCircle $tone={tone} aria-hidden>
          <Icon icon={icon} size={32} />
        </IconCircle>
      ) : null}
      <Title>{title}</Title>
      {description ? <Description>{description}</Description> : null}
      {children ? <Body>{children}</Body> : null}
    </Root>
  );
});
StatePage.displayName = 'StatePage';
