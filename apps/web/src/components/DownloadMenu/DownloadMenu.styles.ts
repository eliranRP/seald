import styled, { keyframes } from 'styled-components';

const menuIn = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

/* ---- Split button ---------------------------------------------------- */

export const Root = styled.div`
  position: relative;
  display: inline-flex;
`;

export const SplitButton = styled.button`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 9px 14px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-right: none;
  border-radius: 10px 0 0 10px;
  cursor: pointer;
  white-space: nowrap;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export const ChevronButton = styled.button<{ $open: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 9px 10px;
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[2]};
  background: ${({ theme, $open }) => ($open ? theme.color.ink[100] : theme.color.bg.surface)};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 0 10px 10px 0;
  cursor: pointer;
  transition: background 140ms;
  & svg {
    transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'none')};
    transition: transform 160ms;
  }
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.color.ink[100]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

export const SplitIcon = styled.span<{ $spinning: boolean }>`
  display: inline-flex;
  color: ${({ theme }) => theme.color.indigo[600]};
  & svg {
    animation: ${({ $spinning }) => ($spinning ? spin : 'none')} 900ms linear infinite;
  }
`;

/* ---- Dropdown menu --------------------------------------------------- */

export const Menu = styled.div`
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 50;
  width: 360px;
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 14px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  padding: ${({ theme }) => theme.space[2]};
  animation: ${menuIn} 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: ${({ theme }) => theme.font.sans};
`;

export const MenuHeading = styled.div`
  padding: 8px 10px 6px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Item = styled.button<{ $active: boolean }>`
  all: unset;
  box-sizing: border-box;
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  align-items: flex-start;
  width: 100%;
  padding: 10px;
  border-radius: 10px;
  text-align: left;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  background: ${({ theme, $active }) => ($active ? theme.color.indigo[50] : 'transparent')};
  transition: background 140ms;
  &:hover:not([aria-disabled='true']):not([data-active='true']) {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &[aria-disabled='true'] {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

export const ItemIcon = styled.div<{ $recommended: boolean }>`
  width: 36px;
  height: 36px;
  border-radius: 9px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, $recommended }) =>
    $recommended ? theme.color.indigo[50] : theme.color.ink[50]};
  border: 1px solid
    ${({ theme, $recommended }) => ($recommended ? theme.color.indigo[200] : theme.color.border[1])};
  color: ${({ theme, $recommended }) =>
    $recommended ? theme.color.indigo[600] : theme.color.fg[2]};
`;

export const ItemIconSpinning = styled.span`
  display: inline-flex;
  & svg {
    animation: ${spin} 900ms linear infinite;
  }
`;

export const ItemBody = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ItemTitleRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  flex-wrap: wrap;
`;

export const ItemTitle = styled.span`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const RecommendedPill = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.bg.surface};
  line-height: 1.2;
`;

export const LockedPill = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.2;
`;

export const ItemDesc = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
  line-height: 1.45;
`;

export const ItemMeta = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[4]};
  margin-top: 4px;
`;

export const Footer = styled.div`
  padding: 10px 10px 4px;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin-top: 6px;
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[4]};
  line-height: 1.5;
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  align-items: flex-start;
`;

export const FooterIcon = styled.span`
  color: ${({ theme }) => theme.color.fg[4]};
  margin-top: 2px;
  flex-shrink: 0;
  display: inline-flex;
`;
