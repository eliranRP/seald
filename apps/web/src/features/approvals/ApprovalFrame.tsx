import type { ReactNode } from 'react';
import styled from 'styled-components';
import { useDocumentTitle } from './useDocumentTitle';

const Page = styled.div`
  min-height: 100dvh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[4]} ${theme.space[12]}`};
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Wordmark = styled.div`
  width: 100%;
  max-width: 560px;
  margin-bottom: ${({ theme }) => theme.space[5]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Column = styled.main`
  width: 100%;
  max-width: 560px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const Title = styled.h1`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodyLg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export interface ApprovalFrameProps {
  /** The page's h1 and its document title. */
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * Bare frame for the approval screens that live outside `AppShell`: the
 * email-link page and the signed-in card. No navigation, no footer links.
 * It also sets the document title, because every SPA route otherwise
 * inherits the shell's.
 */
export function ApprovalFrame({ title, children }: ApprovalFrameProps) {
  useDocumentTitle(title);
  return (
    <Page>
      <Wordmark aria-hidden>Seald</Wordmark>
      <Column>
        <Title>{title}</Title>
        {children}
      </Column>
    </Page>
  );
}
