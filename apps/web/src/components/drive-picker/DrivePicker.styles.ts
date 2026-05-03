import styled from 'styled-components';

/**
 * Modal dimensions are HARD-LOCKED at 760 × 600 per Phase 3 watchpoint
 * #4. Do NOT widen, do NOT make responsive — the source-selection
 * flows downstream rely on this exact footprint to align with the
 * sibling Upload + Template cards. PR review will reject any deviation.
 */
export const PICKER_WIDTH_PX = 760 as const;
export const PICKER_HEIGHT_PX = 600 as const;

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
`;

export const Card = styled.div`
  width: ${PICKER_WIDTH_PX}px;
  height: ${PICKER_HEIGHT_PX}px;
  max-width: 100%;
  max-height: calc(100vh - 48px);
  background: ${({ theme }) => theme.color.paper};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadow.xl};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

export const Header = styled.div`
  padding: 18px 22px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
`;

export const HeaderLogo = styled.span`
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.indigo[600]};
  flex-shrink: 0;
`;

export const Title = styled.h2`
  flex: 1;
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
`;

export const CloseButton = styled.button`
  background: transparent;
  border: none;
  padding: 6px;
  border-radius: 8px;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const PathBar = styled.div`
  padding: 12px 22px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.ink[50]};
  flex-shrink: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const PathRoot = styled.span`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SearchWrap = styled.div`
  padding: 14px 22px 8px;
  flex-shrink: 0;
`;

export const SearchInner = styled.div`
  position: relative;
  display: flex;
  align-items: center;
`;

export const SearchIcon = styled.span`
  position: absolute;
  left: 12px;
  display: inline-flex;
  align-items: center;
  color: ${({ theme }) => theme.color.fg[3]};
  pointer-events: none;
`;

export const SearchInput = styled.input`
  width: 100%;
  padding: 11px 14px 11px 38px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 12px;
  font: 400 14px ${({ theme }) => theme.font.sans};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  outline: none;

  &:focus-visible {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const List = styled.div`
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 12px 8px;
`;

export const Row = styled.button`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  border-radius: 10px;
  cursor: pointer;
  font-family: inherit;
  color: inherit;

  &[aria-selected='true'] {
    background: ${({ theme }) => theme.color.indigo[50]};
  }

  &:hover:not([aria-selected='true']),
  &:focus-visible:not([aria-selected='true']) {
    background: ${({ theme }) => theme.color.ink[50]};
  }

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const RowIcon = styled.span<{ $bg: string; $fg: string }>`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const RowMain = styled.div`
  flex: 1;
  min-width: 0;
`;

export const RowName = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const RowMeta = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const SelectMark = styled.span<{ $selected: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: ${({ $selected, theme }) => ($selected ? theme.color.indigo[600] : 'transparent')};
  color: ${({ theme }) => theme.color.paper};
  border: ${({ $selected, theme }) =>
    $selected ? 'none' : `1.5px solid ${theme.color.border[2]}`};
`;

export const Footer = styled.div`
  padding: 14px 22px;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
  background: ${({ theme }) => theme.color.paper};
`;

export const FooterNote = styled.div`
  flex: 1;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const StatePane = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 48px;
  text-align: center;
  gap: 12px;
`;

export const StateBadge = styled.div<{ $bg: string; $fg: string }>`
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $bg }) => $bg};
  color: ${({ $fg }) => $fg};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;
`;

export const StateTitle = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
`;

export const StateBody = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.6;
  max-width: 440px;
`;

export const StateActions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
`;

export const SkeletonRow = styled.div`
  height: 56px;
  border-radius: 10px;
  margin: 6px 2px;
  background: linear-gradient(
    90deg,
    ${({ theme }) => theme.color.ink[50]} 0%,
    ${({ theme }) => theme.color.ink[100]} 50%,
    ${({ theme }) => theme.color.ink[50]} 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;

  @keyframes shimmer {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }
`;
