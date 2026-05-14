import styled, { css, keyframes } from 'styled-components';

// Mirrors `DownloadMenu`'s `menuIn` so every dropdown surface in the
// app shares the same enter motion.
const menuIn = keyframes`
  from { opacity: 0; transform: translateY(-4px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
`;

export const ToolbarRoot = styled.div`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[3]} 0 ${theme.space[3]}`};
  margin-top: ${({ theme }) => theme.space[2]};
`;

const baseChip = css`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 13px;
  line-height: 1.4;
  cursor: pointer;
  transition:
    background 80ms,
    border-color 80ms;
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ChipButton = styled.button<{ $active: boolean }>`
  ${baseChip}
  ${({ theme, $active }) =>
    $active
      ? css`
          border-color: ${theme.color.indigo[500]};
          background: ${theme.color.indigo[50]};
          color: ${theme.color.indigo[700]};
        `
      : ''}
`;

export const ChipLabel = styled.span`
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const ChipValue = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ChipClearButton = styled.button`
  all: unset;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: ${({ theme }) => theme.space[1]};
  border-radius: ${({ theme }) => theme.radius.pill};
  color: ${({ theme }) => theme.color.fg[3]};
  &:hover {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

/**
 * Search chip is a regular text input rather than a popover trigger
 * because the search-as-you-type interaction is fundamentally inline.
 *
 * Capped to 320 px so the search + four filter chips share visual
 * weight along the toolbar row — at the previous 280 px ceiling the
 * search still grew under flex pressure on wide screens and dwarfed
 * the chips.
 */
export const SearchInputWrap = styled.label`
  ${baseChip}
  flex: 0 1 320px;
  max-width: 320px;
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[3]}`};
  cursor: text;
  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const SearchInput = styled.input`
  border: none;
  background: transparent;
  outline: none;
  flex: 1;
  font: inherit;
  color: inherit;
  &::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;

export const SearchClear = styled.button`
  all: unset;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radius.pill};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

// Matches the `DownloadMenu.Menu` surface: 14px radius, full pad,
// large soft shadow, and the same enter animation. Keeps every
// dropdown in the app reading as one design language.
export const PopoverCard = styled.div`
  z-index: 20;
  min-width: 280px;
  max-width: 360px;
  padding: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 14px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  display: flex;
  flex-direction: column;
  font-family: ${({ theme }) => theme.font.sans};
  animation: ${menuIn} 160ms cubic-bezier(0.2, 0.8, 0.2, 1);
`;

// Equivalent of `DownloadMenu.MenuHeading` — uppercase mono kicker
// that opens each section.
export const PopoverHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px 6px;
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const PopoverHeaderAction = styled.button`
  all: unset;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  text-transform: none;
  letter-spacing: 0;
  color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

// `DownloadMenu.Item` analogue. Larger touch target, 10px padding
// and rounded radius, hover background. The full row is the click
// affordance; consumers nest the checkbox/radio + label inside.
//
// Tints native checkboxes / radios with the brand indigo via the
// modern `accent-color` property — works in every browser we
// target (Chromium 93+, Safari 15.4+, Firefox 92+) and avoids
// having to re-implement the input chrome.
export const Option = styled.label<{ $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 10px;
  border-radius: 10px;
  font-size: 13px;
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  transition: background 140ms;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  & input[type='checkbox'],
  & input[type='radio'] {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};
  }
  &:hover {
    background: ${({ theme }) => theme.color.ink[50]};
  }
`;

// Square icon slot to the left of each option — same dimensions as
// `DownloadMenu.ItemIcon`. Status chips drop a colored status dot
// inside; signer chips drop an initials avatar.
export const OptionIcon = styled.div<{
  $tone?: 'indigo' | 'amber' | 'emerald' | 'red' | 'neutral';
}>`
  width: 36px;
  height: 36px;
  border-radius: 9px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${({ theme, $tone }) => {
    switch ($tone) {
      case 'indigo':
        return theme.color.indigo[50];
      case 'amber':
        return theme.color.warn[50];
      case 'emerald':
        return theme.color.success[50];
      case 'red':
        return theme.color.danger[50];
      default:
        return theme.color.ink[50];
    }
  }};
  border: 1px solid
    ${({ theme, $tone }) => ($tone === 'indigo' ? theme.color.indigo[200] : theme.color.border[1])};
  color: ${({ theme, $tone }) => {
    switch ($tone) {
      case 'indigo':
        return theme.color.indigo[600];
      case 'amber':
        return theme.color.warn[700];
      case 'emerald':
        return theme.color.success[700];
      case 'red':
        return theme.color.danger[700];
      default:
        return theme.color.fg[2];
    }
  }};
`;

export const OptionBody = styled.div`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

export const OptionLabel = styled.span`
  flex: 1;
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const OptionDesc = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.45;
`;

// Right-aligned monospace count badge (matches `ItemMeta` rhythm).
export const OptionCount = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

// Equivalent of `DownloadMenu.Footer` — tucks the divider + small
// helper note at the bottom of a popover.
export const PopoverFooter = styled.div`
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

export const PopoverFooterIcon = styled.span`
  color: ${({ theme }) => theme.color.fg[4]};
  margin-top: 2px;
  flex-shrink: 0;
  display: inline-flex;
`;

// Match the option-row text size (13 px) instead of inheriting the
// page's default body font, which made the placeholder dwarf the
// rest of the popover (bug 2026-05-10).
export const SignerInput = styled.input`
  margin: 4px 6px 6px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  line-height: 1.4;
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  &::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const CustomDateRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
`;

export const CustomDateField = styled.input`
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 8px;
  padding: 8px 10px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 13px;
  line-height: 1.4;
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ResetButton = styled.button`
  all: unset;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[50]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
