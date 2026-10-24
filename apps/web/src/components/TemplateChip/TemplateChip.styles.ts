import styled, { css } from 'styled-components';
import { pressable } from '@/styles/motion';

/** Canvas `.tpl-chip` (40px pill); `$card` is the phone `.m-card` row. */
export const Chip = styled.button<{ readonly $card: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  height: 40px;
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
  ${pressable}

  ${({ $card, theme }) =>
    $card &&
    css`
      display: flex;
      gap: ${theme.space[3]};
      width: 100%;
      height: auto;
      min-height: 64px;
      padding: ${theme.space[3]};
      border-radius: ${theme.radius.md};
      font-weight: ${theme.font.weight.regular};
      text-align: left;
    `}

  &:hover {
    background: ${({ theme }) => theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Meta = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/** Canvas `.tile-ico`. */
export const CardIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const CardText = styled.span`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

/** Canvas `.h3`. */
export const CardName = styled.span`
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: 24px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;
