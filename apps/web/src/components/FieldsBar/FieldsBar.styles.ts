import styled from 'styled-components';

export const Aside = styled.aside`
  width: 360px;
  border-left: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  padding: ${({ theme }) => theme.space[6]};
  overflow-y: auto;
  height: 100%;
  box-sizing: border-box;
`;

export const Title = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const Subtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[1]} 0 0;
`;

export const TileGrid = styled.ul`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[2]};
  margin: ${({ theme }) => theme.space[4]} 0 0;
  padding: 0;
  list-style: none;
`;

export const TileItem = styled.li`
  margin: 0;
  padding: 0;
`;

export const Tile = styled.div`
  padding: ${({ theme }) => theme.space[3]} 10px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[2]};
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  cursor: grab;
  background: ${({ theme }) => theme.color.bg.surface};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:active {
    cursor: grabbing;
  }
`;

export const Divider = styled.hr`
  border: 0;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: ${({ theme }) => `${theme.space[6]} -${theme.space[6]} 0`};
`;

export const Eyebrow = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  padding-top: ${({ theme }) => theme.space[5]};
`;

export const SignerList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: ${({ theme }) => theme.space[3]} 0 0;
  padding: 0;
  list-style: none;
`;

export const SignerItem = styled.li`
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const SignerRow = styled.div<{
  readonly $active: boolean;
  readonly $clickable: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: ${({ theme }) => theme.space[2]} 10px;
  border-radius: 10px;
  background: ${({ $active, theme }) => ($active ? theme.color.indigo[50] : theme.color.ink[50])};
  box-shadow: ${({ $active, theme }) => ($active ? theme.shadow.focus : 'none')};
  cursor: ${({ $clickable }) => ($clickable ? 'pointer' : 'default')};
  width: 100%;
  text-align: left;
  appearance: none;
  border: 0;
  font: inherit;
  color: inherit;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const SignerBadge = styled.span<{ readonly $tone: 'indigo' | 'success' }>`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  color: ${({ theme }) => theme.color.bg.surface};
  background: ${({ $tone, theme }) =>
    $tone === 'success' ? theme.color.success[500] : theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
`;

export const SignerText = styled.div`
  flex: 1;
  min-width: 0;
`;

export const SignerName = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SignerEmail = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const AddSignerSlot = styled.div`
  margin-top: 10px;
`;
