import styled, { type DefaultTheme } from 'styled-components';
import type { BadgeTone } from './Badge.types';

const toneStyles = (t: DefaultTheme, tone: BadgeTone) =>
  ({
    indigo: { bg: t.color.indigo[50], fg: t.color.indigo[800], dot: t.color.indigo[600] },
    amber: { bg: t.color.warn[50], fg: t.color.warn[700], dot: t.color.warn[500] },
    emerald: { bg: t.color.success[50], fg: t.color.success[700], dot: t.color.success[500] },
    red: { bg: t.color.danger[50], fg: t.color.danger[700], dot: t.color.danger[500] },
    neutral: { bg: t.color.ink[100], fg: t.color.fg[2], dot: t.color.fg[3] },
  })[tone];

export const BadgeRoot = styled.span<{ $tone: BadgeTone }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: 4px 10px 4px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 1.2;
  background: ${({ theme, $tone }) => toneStyles(theme, $tone).bg};
  color: ${({ theme, $tone }) => toneStyles(theme, $tone).fg};
`;

export const Dot = styled.span<{ $tone: BadgeTone }>`
  width: 6px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $tone }) => toneStyles(theme, $tone).dot};
`;
