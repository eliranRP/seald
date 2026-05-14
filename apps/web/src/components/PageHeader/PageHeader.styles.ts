import styled from 'styled-components';
import type { PageHeaderSize } from './PageHeader.types';

export const Root = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[6]};
`;

export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

export const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

/**
 * `$size` picks between the kit-standard 48 px H1 (`lg`, default) and
 * the 36 px H1 the Dashboard uses (`md`). Sizing is the only thing the
 * variant changes; family / weight / tracking stay the same so the two
 * sizes still feel like the same masthead.
 */
export const Title = styled.h1<{ readonly $size: PageHeaderSize }>`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme, $size }) => ($size === 'md' ? theme.font.size.h2 : theme.font.size.h1)};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const Actions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
`;
