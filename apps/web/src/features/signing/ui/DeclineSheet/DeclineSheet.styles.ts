import styled from 'styled-components';

export const Chips = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
`;

/** Reason chip (canvas `.chip-choice`). */
export const Chip = styled.button<{ readonly $on: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  height: 36px;
  padding: 0 14px;
  border: 1px solid ${({ theme, $on }) => ($on ? theme.color.indigo[600] : theme.color.border[1])};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme, $on }) => ($on ? theme.color.indigo[50] : theme.color.paper)};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $on }) =>
    $on ? theme.font.weight.semibold : theme.font.weight.regular};
  color: ${({ theme, $on }) => ($on ? theme.color.indigo[800] : theme.color.fg[2])};
  cursor: pointer;
  transition:
    border-color ${({ theme }) => theme.motion.durBase},
    background ${({ theme }) => theme.motion.durBase};

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Note = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  min-height: 88px;
  padding: 12px;
  resize: vertical;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodyMd};
  color: ${({ theme }) => theme.color.fg[1]};

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
