import styled from 'styled-components';
import { SENDER_PROGRESS_NOTE, SENDER_PROGRESS_SELF_SIGNER_NOTE } from 'shared';

const SelfSigner = styled.span`
  display: block;
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

/**
 * What the sender is told after send. The sentences live in
 * `packages/shared/src/product-claims.ts`. The self-signer line sits
 * under the lede so it is not part of that paragraph.
 */
export function SenderProgressNote() {
  return (
    <>
      <span>{SENDER_PROGRESS_NOTE}</span>
      <SelfSigner>{SENDER_PROGRESS_SELF_SIGNER_NOTE}</SelfSigner>
    </>
  );
}
