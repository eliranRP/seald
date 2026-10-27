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

  /* 44px touch target on a phone. */
  @media (max-width: 640px) {
    height: 44px;
  }
`;

export const NoteLabel = styled.label`
  display: block;
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Note = styled.textarea`
  box-sizing: border-box;
  width: 100%;
  min-height: 88px;
  padding: 12px;
  resize: vertical;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[1]};

  /* 16px on a phone so iOS does not zoom into the field. */
  @media (max-width: 640px) {
    font-size: ${({ theme }) => theme.font.size.body};
  }

  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[600]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
