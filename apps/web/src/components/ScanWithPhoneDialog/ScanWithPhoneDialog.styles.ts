import styled from 'styled-components';
import { DialogCard } from '../DialogPrimitives';

/**
 * Scan boards (`Scan-D-*`, seald.css `.modal`): a 440px modal with a bordered
 * head (20/24 padding, 24px serif title, 44px close) over a 24px body that
 * stacks its parts with a 20px gap.
 */
export const Card = styled(DialogCard)`
  max-width: 440px;
  gap: 0;
  padding: 0;
`;

export const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  padding: 20px ${({ theme }) => theme.space[6]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  text-align: left;
`;

export const Body = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  padding: ${({ theme }) => theme.space[6]};
  text-align: center;
`;

/** `.qr-box`: 168px with a 12px quiet zone. */
export const QrWrap = styled.div<{ $dim: boolean }>`
  position: relative;
  box-sizing: border-box;
  width: 168px;
  height: 168px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  img {
    width: 100%;
    height: 100%;
    display: block;
    image-rendering: pixelated;
    opacity: ${({ $dim }) => ($dim ? 0.15 : 1)};
  }
`;

export const QrOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: rgba(255, 255, 255, 0.8);
`;

/** `.h3` over the dimmed code. */
export const OverlayTitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/** `.meta` / `.icon-meta`: 13px, 4px icon gap. */
export const Meta = styled.p`
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: 1.5;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Status = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
`;

export const Received = styled(Status)`
  gap: 20px;
`;

/** `.state-ico.is-ok`: 72px disc, 32px icon. */
export const Done = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[700]};
`;

/** `.h2`: 24px serif, 1.25 line height. */
export const Heading = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;
