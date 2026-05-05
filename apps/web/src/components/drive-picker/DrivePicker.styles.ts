import styled from 'styled-components';

/**
 * Modal dimensions are HARD-LOCKED at 760 × 600 per Phase 3 watchpoint
 * #4. Phase 2b reuses the constants for the loading + error overlay
 * shown while Google's official picker is being loaded; the picker
 * iframe itself is sized by Google. Do NOT widen, do NOT make
 * responsive — PR review will reject any deviation.
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
  width: 420px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadow.xl};
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 28px 28px 24px;
  gap: 16px;
`;

export const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 20px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
`;

export const Body = styled.p`
  margin: 0;
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: 1.6;
`;

export const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
`;

export { Spinner } from '@/components/shared/Spinner';
