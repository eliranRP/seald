import styled from 'styled-components';
import { DialogSectionedCard } from '../DialogPrimitives';

export const Card = styled(DialogSectionedCard)<{ $width: number }>`
  max-width: ${({ $width }) => `${String($width)}px`};
  /* Programmatic focus target on open; the card itself needs no ring. */
  &:focus {
    outline: none;
  }
`;

export const Title = styled.h2`
  flex: 1;
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

/** Footer row: optional start content, buttons pushed to the right. */
export const Foot = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  padding-top: ${({ theme }) => theme.space[4]};
`;

export const FootStart = styled.div`
  flex: 1;
  min-width: 0;
`;

/** Inside the mobile sheet the footer buttons fill the width. */
export const SheetFoot = styled(Foot)`
  & > button {
    flex: 1;
  }
`;
