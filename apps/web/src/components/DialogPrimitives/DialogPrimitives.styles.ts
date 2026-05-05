import styled from 'styled-components';

/**
 * Shared modal backdrop — full-screen overlay with centered flex layout.
 * Used by all dialog/modal components across the app. The default background
 * opacity (0.48) matches the design system; override via styled() if a
 * specific dialog needs a lighter/darker scrim.
 */
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

/**
 * Shared dialog card surface — centered white card with rounded corners.
 * Default max-width is 440px (confirm-style dialogs); override via styled()
 * for wider dialogs.
 */
export const DialogCard = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

/**
 * Shared dialog title styled as h2.
 */
export const DialogTitle = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/**
 * Shared dialog description paragraph.
 */
export const DialogDescription = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

/**
 * Shared dialog footer — right-aligned row of buttons.
 */
export const DialogFooter = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;
