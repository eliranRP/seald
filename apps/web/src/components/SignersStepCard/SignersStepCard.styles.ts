import styled from 'styled-components';
import { truncateText } from '@/styles/mixins';

/**
 * Outer page surface. Centered card on a light app background — the
 * design pulls the chrome out of the editor and frames signer-picking
 * as a focused decision (see `Design-Guide/.../UseTemplate.jsx`
 * SignersStep).
 */
export const Page = styled.div`
  padding: 48px 24px 100px;
  display: flex;
  justify-content: center;
  min-height: calc(100vh - 200px);
  align-items: flex-start;
`;

export const Card = styled.div`
  width: 100%;
  max-width: 640px;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 20px;
  box-shadow: ${({ theme }) => theme.shadow.lg};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 36px 36px 0;
  display: flex;
  flex-direction: column;
`;

export const Heading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 28px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.2;
  margin: 0;
`;

export const Subhead = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 8px 0 0;
  line-height: 1.55;
`;

/**
 * Empty-state pill — soft neutral surface with dashed border. The
 * dashed treatment signals "you can drop something here without
 * committing" while the body content is conversational, not commanding.
 */
export const EmptyPill = styled.div`
  margin-top: 22px;
  padding: 22px 16px;
  text-align: center;
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
`;

export const SignerList = styled.div`
  margin-top: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SignerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 12px;
`;

export const Avatar = styled.span<{ $color: string }>`
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  flex-shrink: 0;
`;

export const SignerInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const SignerName = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  ${truncateText}
`;

export const SignerEmail = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  ${truncateText}
`;

export const OrdinalChip = styled.span`
  font-size: 11px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[100]};
  padding: 3px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
`;

export const RemoveButton = styled.button`
  background: transparent;
  border: none;
  padding: 6px;
  border-radius: 6px;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

/**
 * "Add signer" pill — soft indigo wash + dashed indigo border so it
 * reads as the next obvious affordance without competing with the
 * primary Continue CTA at the bottom.
 */
export const AddSignerPill = styled.button`
  margin-top: 12px;
  width: 100%;
  padding: 14px 16px;
  background: ${({ theme }) => theme.color.indigo[50]};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: 14px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: ${({ theme }) => theme.color.indigo[700]};
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-family: inherit;
  transition:
    background 140ms,
    border-color 140ms;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[100]};
    border-color: ${({ theme }) => theme.color.indigo[500]};
  }
`;

/**
 * Inline contacts picker — flat panel embedded inside the SignersStepCard
 * (not a popover). Mirrors the design guide's SignersStep inline picker:
 * search header on top, scrollable contact list with checkbox rows,
 * footer with "N selected" + Done button. We deliberately don't reuse
 * AddSignerDropdown because that component is `position: absolute`-
 * driven popover chrome and would escape this card layout.
 */
export const InlinePickerWrap = styled.div`
  margin-top: 12px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 14px;
  overflow: hidden;
  background: ${({ theme }) => theme.color.paper};
`;

export const InlinePickerHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.ink[50]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const InlinePickerSearchInput = styled.input`
  flex: 1;
  border: none;
  outline: none;
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[1]};
  background: transparent;
  font-family: inherit;

  &::placeholder {
    color: ${({ theme }) => theme.color.fg[3]};
  }
`;

export const InlinePickerCloseBtn = styled.button`
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const InlinePickerList = styled.div`
  max-height: 280px;
  overflow: auto;
  padding: 4px 0;
`;

export const InlinePickerEmpty = styled.div`
  padding: 24px 16px;
  text-align: center;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;

export const InlinePickerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  cursor: pointer;
  font-family: inherit;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.ink[50]};
  }
`;

/**
 * Checkbox surface that flips to a filled green tile when checked —
 * matches the design guide's "selected" visual where the indicator
 * itself colors with the success swatch (green check on green
 * background) rather than just toggling a tick.
 */
export const InlinePickerCheck = styled.span<{ $checked: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1.75px solid
    ${({ $checked, theme }) => ($checked ? theme.color.success[500] : theme.color.border[2])};
  background: ${({ $checked, theme }) => ($checked ? theme.color.success[500] : theme.color.paper)};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const InlinePickerAvatar = styled.span<{ $color: string }>`
  width: 30px;
  height: 30px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.bold};
  flex-shrink: 0;
`;

export const InlinePickerInfo = styled.div`
  flex: 1;
  min-width: 0;
`;

export const InlinePickerName = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const InlinePickerEmail = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * "Add as guest" affordance pinned at the bottom of the list when the
 * current search is a valid email and not already in contacts. Soft
 * indigo wash to read as a creation step distinct from the contact
 * rows above it.
 */
export const InlinePickerAddGuestRow = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  cursor: pointer;
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  background: ${({ theme }) => theme.color.indigo[50]};
  font-size: 13.5px;
  color: ${({ theme }) => theme.color.fg[2]};

  & > strong {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.bold};
  }

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.indigo[100]};
  }
`;

export const InlinePickerAddGuestBadge = styled.span`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1.75px solid ${({ theme }) => theme.color.indigo[500]};
  background: ${({ theme }) => theme.color.indigo[500]};
  color: ${({ theme }) => theme.color.fg.inverse};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const InlinePickerFooter = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[50]};
`;

export const InlinePickerDoneButton = styled.button`
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  border: none;
  border-radius: ${({ theme }) => theme.radius.pill};
  padding: 6px 14px;
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  font-family: inherit;

  &:hover,
  &:focus-visible {
    background: ${({ theme }) => theme.color.fg[1]};
  }
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: 28px -36px 0;
  padding: 18px 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
`;

export const BackLink = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 8px 6px;
  font-family: inherit;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
  }
`;
