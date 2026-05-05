import styled from 'styled-components';
import { DialogCard } from '../DialogPrimitives';

/**
 * Extends the shared DialogCard as a <form> with a slightly wider max-width.
 */
export const Card = styled(DialogCard).attrs({ as: 'form' })`
  max-width: 480px;
`;

export const Textarea = styled.textarea`
  font: inherit;
  width: 100%;
  box-sizing: border-box;
  min-height: 92px;
  resize: vertical;
  padding: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldGroup = styled.label`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;
