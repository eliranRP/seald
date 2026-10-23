import styled from 'styled-components';

export const Root = styled.div<{ readonly $color: string | null }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-left: 3px solid ${({ $color, theme }) => $color ?? theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
`;

export const KindLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const Owner = styled.span<{ readonly $muted: boolean }>`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${({ $muted, theme }) => ($muted ? theme.color.fg[3] : theme.color.fg[2])};
`;

export const RequiredMark = styled.span`
  flex-shrink: 0;
  color: ${({ theme }) => theme.color.danger[500]};
  font-weight: ${({ theme }) => theme.font.weight.bold};
`;
