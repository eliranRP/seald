import styled, { type DefaultTheme } from 'styled-components';
import { mobileInputText } from '@/styles/mixins';
import { spring } from '@/styles/motion';
import type { EmailChipKind } from '@/features/contacts/classifyEmails';

/** Chip box (canvas `.email-chips`): wraps chips and the text field. */
export const Box = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  align-items: center;
  gap: 6px;
  min-height: 96px;
  padding: 10px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
  cursor: text;
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeOut};

  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

const chipColors = (t: DefaultTheme, kind: EmailChipKind) =>
  ({
    new: { bg: t.color.indigo[50], fg: t.color.indigo[800] },
    duplicate: { bg: t.color.ink[100], fg: t.color.fg[3] },
    invalid: { bg: t.color.danger[50], fg: t.color.danger[700] },
  })[kind];

export const Chip = styled.span<{ $kind: EmailChipKind }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 4px 0 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  background: ${({ theme, $kind }) => chipColors(theme, $kind).bg};
  color: ${({ theme, $kind }) => chipColors(theme, $kind).fg};
  text-decoration: ${({ $kind }) => ($kind === 'duplicate' ? 'line-through' : 'none')};
  ${spring}
`;

export const ChipRemove = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover {
    background: ${({ theme }) => theme.color.ink[200]};
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Field = styled.input`
  flex: 1;
  min-width: 160px;
  height: 28px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: ${({ theme }) =>
    `${theme.font.weight.regular} ${theme.font.size.bodySm} ${theme.font.sans}`};
  ${mobileInputText}
  color: ${({ theme }) => theme.color.fg[1]};

  &::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;
