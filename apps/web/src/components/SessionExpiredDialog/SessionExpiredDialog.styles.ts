import styled from 'styled-components';
import { DialogCard } from '../DialogPrimitives';

/**
 * System boards, `session` state: a 440px modal whose centred body (40/32
 * padding, 12px gap) holds a 56px warn lock, the 24px serif title and one
 * meta line, over a bordered footer with the centred Sign in again. On a
 * phone the same stack sits in a bottom sheet above a full-width button.
 */
export const Card = styled(DialogCard)`
  max-width: 440px;
  gap: 0;
  padding: 0;
`;

export const CardBody = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[8]};
  text-align: center;
`;

export const CardFoot = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[6]};
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
`;

/** `.state-ico.is-warn` at 56px. */
export const LockIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.warn[50]};
  color: ${({ theme }) => theme.color.warn[700]};
`;

/** `.h2`: 24px serif. */
export const Heading = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** `.meta`. */
export const Meta = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SheetBody = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[4]};
`;

export const SheetStack = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[4]} ${({ theme }) => theme.space[2]};
  text-align: center;
`;
