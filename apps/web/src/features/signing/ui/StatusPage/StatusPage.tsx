import { Spinner } from '@/components/Spinner';
import { SignHeader } from '../SignHeader';
import { Body, Column, Disc, Page, Title } from './StatusPage.styles';
import type { StatusPageProps } from './StatusPage.types';

/**
 * Public status page of the signer flow (done, declined and every link
 * state): logo-only header, a round icon, a heading, then whatever the
 * caller stacks under it.
 */
export function StatusPage(props: StatusPageProps) {
  const { tone, icon: IconGlyph, busy = false, title, children } = props;
  return (
    <Page>
      <SignHeader />
      <Column {...(busy ? { role: 'status', 'aria-live': 'polite' as const } : {})}>
        {busy ? (
          <Spinner size="lg" />
        ) : (
          <Disc $tone={tone} aria-hidden="true">
            <IconGlyph size={32} strokeWidth={2} />
          </Disc>
        )}
        <Title>{title}</Title>
        {children ? <Body>{children}</Body> : null}
      </Column>
    </Page>
  );
}
