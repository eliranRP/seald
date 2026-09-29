import styled from 'styled-components';
import { SIGNATURE_LEVEL_NOTE } from 'shared';

const Note = styled.p`
  margin: ${({ theme }) => theme.space[5]} 0 0;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  text-align: left;
`;

/**
 * Signature-level disclosure shared by the signer prep and done screens.
 * Wording lives in `packages/shared` so the audit PDF and emails can
 * stay on the same description.
 */
export function SignatureLevelNote() {
  return <Note>{SIGNATURE_LEVEL_NOTE}</Note>;
}
