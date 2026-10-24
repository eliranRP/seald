import styled from 'styled-components';

export const Root = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const SectionHeader = styled.h3`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 0;
  padding: ${({ theme }) => theme.space[2]} ${({ theme }) => theme.space[1]};
`;

export const SectionHeaderTop = styled(SectionHeader)`
  padding-top: ${({ theme }) => theme.space[2]};
`;

export const SectionHeaderNext = styled(SectionHeader)`
  padding-top: ${({ theme }) => theme.space[3]};
`;

export const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.color.fg[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  cursor: grab;
  user-select: none;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:active {
    cursor: grabbing;
  }
`;

export const RowLabel = styled.span`
  flex: 1;
`;

/**
 * Small mono-font pill showing how many fields of this kind are placed
 * across the whole document. Sits next to the row label so users can tell
 * at a glance which kinds they've already used.
 */
export const UsageBadge = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: 1px 6px;
  flex-shrink: 0;
  line-height: 1.4;
`;

export const HintCard = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.indigo[50]};
  border-radius: 10px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.indigo[800]};
  line-height: 1.5;
`;

export const TileGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[2]};
`;

export const FieldTile = styled.div<{ $active: boolean }>`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 68px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: ${({ $active }) => ($active ? '1.5px' : '1px')} solid
    ${({ theme, $active }) => ($active ? theme.color.indigo[600] : theme.color.border[1])};
  background: ${({ theme, $active }) => ($active ? theme.color.indigo[50] : theme.color.paper)};
  color: ${({ theme, $active }) => ($active ? theme.color.indigo[800] : theme.color.fg[2])};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  cursor: grab;
  user-select: none;
  &:hover {
    background: ${({ theme, $active }) => ($active ? theme.color.indigo[50] : theme.color.ink[50])};
    border-color: ${({ theme, $active }) =>
      $active ? theme.color.indigo[600] : theme.color.border[2]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:active {
    cursor: grabbing;
  }
`;

export const TileUsage = styled(UsageBadge)`
  position: absolute;
  top: 4px;
  right: 4px;
`;

/** PrepareMobile `.m-scroll-x` of `.tpl-chip`s: 44px pills, 12px apart. */
export const ChipRowWrap = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
`;

export const FieldChip = styled(FieldTile)`
  flex-direction: row;
  width: auto;
  height: 44px;
  gap: ${({ theme }) => theme.space[2]};
  padding: 0 14px;
  border-radius: ${({ theme }) => theme.radius.pill};
  white-space: nowrap;
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;
