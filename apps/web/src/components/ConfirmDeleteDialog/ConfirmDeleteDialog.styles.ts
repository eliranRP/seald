import styled from 'styled-components';

/** Centred icon, title and note; the buttons sit in a row below. */
export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[2]} 0`};
  text-align: center;
`;

/** Red circle behind the trash glyph (canvas `.state-ico.is-bad`). */
export const StateIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Note = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: flex;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
`;
