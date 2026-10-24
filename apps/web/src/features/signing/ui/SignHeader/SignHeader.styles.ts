import styled from 'styled-components';
import { truncateText } from '@/styles/mixins';

/** Public signer header (canvas `.sign-top`): no app navigation. */
export const Top = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};

  @media (max-width: 640px) {
    height: 56px;
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

export const Logo = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;
`;

export const LogoMark = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.script};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: ${({ theme }) => theme.font.size.xl};
  line-height: 1;
`;

export const Wordmark = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (max-width: 640px) {
    display: none;
  }
`;

export const Divider = styled.span`
  width: 1px;
  height: 24px;
  background: ${({ theme }) => theme.color.border[1]};

  @media (max-width: 640px) {
    display: none;
  }
`;

export const DocTitle = styled.h1`
  flex: 0 1 auto;
  min-width: 0;
  margin: 0;
  ${truncateText}
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.lg};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (max-width: 640px) {
    flex: 1;
    font-size: ${({ theme }) => theme.font.size.body};
  }
`;

export const From = styled.span`
  ${truncateText}
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};

  @media (max-width: 640px) {
    display: none;
  }
`;

export const Spacer = styled.span`
  flex: 1;

  @media (max-width: 640px) {
    display: none;
  }
`;

export const Actions = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  flex-shrink: 0;
`;
