import { forwardRef } from 'react';
import type { PageHeaderProps } from './PageHeader.types';
import { Actions, Eyebrow, Root, Title, TitleBlock } from './PageHeader.styles';

/**
 * L2 domain component — standard page masthead: an optional eyebrow, a serif
 * H1 title, and an optional inline actions slot (usually a Button). Used at
 * the top of Dashboard / Contacts and other list-style pages.
 */
export const PageHeader = forwardRef<HTMLDivElement, PageHeaderProps>((props, ref) => {
  const { eyebrow, title, actions, ...rest } = props;
  return (
    <Root ref={ref} {...rest}>
      <TitleBlock>
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <Title>{title}</Title>
      </TitleBlock>
      {actions ? <Actions>{actions}</Actions> : null}
    </Root>
  );
});
PageHeader.displayName = 'PageHeader';
