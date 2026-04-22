import styled from 'styled-components';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space[8]};
  gap: ${({ theme }) => theme.space[6]};
`;

export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const HeaderActions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
`;

export const StatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.space[4]};
  margin-bottom: ${({ theme }) => theme.space[6]};
`;

export const StatCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[5]}`};
`;

export const StatLabel = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const StatValue = styled.div<{ readonly $tone: 'indigo' | 'amber' | 'emerald' | 'neutral' }>`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  margin-top: ${({ theme }) => theme.space[1]};
  color: ${({ $tone, theme }) => {
    if ($tone === 'indigo') return theme.color.indigo[600];
    if ($tone === 'amber') return theme.color.warn[500];
    if ($tone === 'emerald') return theme.color.success[500];
    return theme.color.fg[2];
  }};
`;

export const Tabs = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[1]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const TabButton = styled.button<{ readonly $active: boolean }>`
  appearance: none;
  background: transparent;
  border: none;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  font-size: 14px;
  font-family: ${({ theme }) => theme.font.sans};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ $active, theme }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  border-bottom: 2px solid
    ${({ $active, theme }) => ($active ? theme.color.indigo[600] : 'transparent')};
  margin-bottom: -1px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const TabCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[100]};
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const TableShell = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-top: none;
  border-radius: ${({ theme }) => `0 0 ${theme.radius.xl} ${theme.radius.xl}`};
  overflow: hidden;
`;

const GRID = '1.3fr 1fr 180px 120px 56px';

export const TableHead = styled.div`
  display: grid;
  grid-template-columns: ${GRID};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  background: ${({ theme }) => theme.color.ink[50]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const TableRow = styled.button`
  all: unset;
  box-sizing: border-box;
  display: grid;
  width: 100%;
  grid-template-columns: ${GRID};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  align-items: center;
  cursor: pointer;
  text-align: left;
  &:last-child {
    border-bottom: none;
  }
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const DocCell = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  min-width: 0;
`;

export const DocTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const DocCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const RecipientCell = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  align-items: center;
  min-width: 0;
`;

export const RecipientLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const DateCell = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const EmptyState = styled.div`
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[5]}`};
  text-align: center;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
`;
