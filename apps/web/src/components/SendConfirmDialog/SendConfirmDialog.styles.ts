import styled, { keyframes } from 'styled-components';

const fadeIn = keyframes`
  from { opacity: 0; }
  to   { opacity: 1; }
`;

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: ${fadeIn} 160ms ease-out;
`;

export const Card = styled.div`
  width: 520px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: 28px 28px 22px;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
`;

export const HeaderIcon = styled.div`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const Title = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
  margin: 0;
`;

export const Subtitle = styled.p`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin: 4px 0 0;
  line-height: 1.5;
`;

export const ChoiceList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
`;

/**
 * One of two stacked choice buttons. The recommended action ("send and
 * update") gets `$tone="primary"` (soft indigo wash + indigo border),
 * the alternative ("just send") gets `$tone="neutral"`. We don't use
 * the existing `Button` because each choice is a multi-line tile with
 * an icon, label, helper text, and a trailing chevron — different
 * affordance from a CTA button.
 */
export const ChoiceButton = styled.button<{ $tone: 'primary' | 'neutral' }>`
  text-align: left;
  padding: 14px 16px;
  border-radius: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: inherit;
  background: ${({ theme, $tone }) =>
    $tone === 'primary' ? theme.color.indigo[50] : theme.color.paper};
  border: ${({ theme, $tone }) =>
    $tone === 'primary'
      ? `1.5px solid ${theme.color.indigo[300]}`
      : `1px solid ${theme.color.border[1]}`};
  color: ${({ theme }) => theme.color.fg[1]};

  &:hover,
  &:focus-visible {
    border-color: ${({ theme, $tone }) =>
      $tone === 'primary' ? theme.color.indigo[500] : theme.color.fg[3]};
  }
`;

export const ChoiceIconLeading = styled.span<{ $tone: 'primary' | 'neutral' }>`
  flex-shrink: 0;
  color: ${({ theme, $tone }) =>
    $tone === 'primary' ? theme.color.indigo[700] : theme.color.fg[2]};
  display: inline-flex;
`;

export const ChoiceText = styled.div`
  flex: 1;
  min-width: 0;
`;

export const ChoiceLabel = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ChoiceHelp = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const ChoiceIconTrailing = styled.span`
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  flex-shrink: 0;
`;

export const FooterRow = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
`;
