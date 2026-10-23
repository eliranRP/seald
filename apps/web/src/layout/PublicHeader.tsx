import type { JSX } from 'react';
import styled from 'styled-components';

const Bar = styled.header`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  min-height: 64px;
  padding: 0 ${({ theme }) => theme.space[6]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.paper};

  @media (max-width: 640px) {
    min-height: 56px;
    padding: 0 ${({ theme }) => theme.space[4]};
  }
`;

const Mark = styled.span`
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

const Word = styled.span`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** Logo-only header for public system pages (404 signed out, maintenance). */
export function PublicHeader(): JSX.Element {
  return (
    <Bar>
      <Mark aria-hidden>S</Mark>
      <Word>Seald</Word>
    </Bar>
  );
}
