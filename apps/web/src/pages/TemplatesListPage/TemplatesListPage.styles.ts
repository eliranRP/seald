import styled, { keyframes } from 'styled-components';

export const Main = styled.div`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: 40px 48px 80px;
`;

export const Inner = styled.div`
  max-width: 1320px;
  display: flex;
  flex-direction: column;
`;

/* ============================================================
 * Header (serif title + Lede + primary CTA)
 * ============================================================ */

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
`;

export const HeaderTitle = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

export const Lede = styled.p`
  margin: 6px 0 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/* ============================================================
 * Toolbar — tag filter, active-tag chips, group toggle, search
 * ============================================================ */

export const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`;

export const ToolbarSpacer = styled.div`
  flex: 1;
`;

export const GroupToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  user-select: none;
  white-space: nowrap;

  & > input {
    accent-color: ${({ theme }) => theme.color.indigo[600]};
  }
`;

export const SearchBox = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 10px;
  background: ${({ theme }) => theme.color.paper};
  width: 240px;

  & > input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: ${({ theme }) => theme.color.fg[1]};
  }

  & > input::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;

/* ============================================================
 * Active-tag chips row (next to filter trigger)
 * ============================================================ */

export const ActiveTagPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 11.5px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const ActiveTagRemove = styled.button`
  border: none;
  background: rgba(0, 0, 0, 0.08);
  color: inherit;
  width: 16px;
  height: 16px;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-family: inherit;
`;

export const ActiveTagOverflow = styled.span`
  font-size: 11.5px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

/* ============================================================
 * Grid / Group sections
 * ============================================================ */

export const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 18px;
`;

export const GroupSection = styled.section`
  display: flex;
  flex-direction: column;
  gap: 14px;

  & + & {
    margin-top: 32px;
  }
`;

export const GroupHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
`;

export const GroupTagPill = styled.span<{ $bg: string; $fg: string }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.02em;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
`;

export const GroupTagDot = styled.span<{ $color: string }>`
  width: 7px;
  height: 7px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
`;

export const GroupCount = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const GroupRule = styled.div`
  flex: 1;
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
`;

/* ============================================================
 * Empty state
 * ============================================================ */

export const EmptyState = styled.div`
  margin-top: 16px;
  padding: 40px 16px;
  border: 1px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: 14px;
  background: ${({ theme }) => theme.color.paper};
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/* ============================================================
 * "New template" tile (sits in the grid)
 * ============================================================ */

export const CreateCard = styled.button`
  all: unset;
  cursor: pointer;
  background: ${({ theme }) => theme.color.paper};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition:
    border-color 140ms ease,
    background 140ms ease,
    transform 140ms ease;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[50]};
    border-color: ${({ theme }) => theme.color.indigo[500]};
    transform: translateY(-1px);
  }
`;

export const CreateThumb = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: ${({ theme }) => theme.color.indigo[50]};
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const CreateBadge = styled.span`
  width: 54px;
  height: 54px;
  border-radius: 14px;
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: ${({ theme }) => theme.shadow.md};
`;

export const CreateBody = styled.div`
  padding: 2px 4px 4px;
  text-align: left;
`;

export const CreateTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 18px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
`;

export const CreateSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 3px;
`;

/* ============================================================
 * Delete confirm modal
 * ============================================================ */

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const ModalBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${fadeIn} 160ms ease-out;
`;

export const ModalCard = styled.div`
  width: 460px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: 28px 28px 22px;
`;

export const ModalHead = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
`;

export const ModalIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const ModalTitle = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin: 0;
`;

export const ModalBody = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 6px 0 0;
  line-height: 1.5;
`;

export const ModalFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 22px;
`;

export const ModalCancelButton = styled.button`
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: 9px 16px;
  border-radius: 10px;
  font-family: inherit;
`;

export const ModalDeleteButton = styled.button`
  background: ${({ theme }) => theme.color.danger[700]};
  color: ${({ theme }) => theme.color.fg.inverse};
  border: none;
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  padding: 9px 16px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: inherit;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.danger[500]};
  }
`;
