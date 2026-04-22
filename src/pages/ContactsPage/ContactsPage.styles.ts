import styled from 'styled-components';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 1024px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
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

export const TableShell = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  overflow: hidden;
`;

const GRID = '1fr 1.4fr 160px 64px';

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

export const TableRow = styled.div`
  display: grid;
  grid-template-columns: ${GRID};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[5]}`};
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  &:last-child {
    border-bottom: none;
  }
`;

export const NameCell = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: center;
  min-width: 0;
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const EmailCell = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const DocsCell = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ActionsCell = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[2]};
  justify-self: end;
`;

export const EmptyState = styled.div`
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[5]}`};
  text-align: center;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
`;

export const DialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.48);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

export const DialogCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 460px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
`;

export const DialogTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const FieldStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

export const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;
