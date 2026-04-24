import styled, { keyframes } from 'styled-components';

const sealPop = keyframes`
  0%   { transform: scale(0); opacity: 0; }
  60%  { transform: scale(1.12); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
`;

const rippleOut = keyframes`
  0%   { transform: scale(0.6); opacity: 0.6; }
  100% { transform: scale(2.2); opacity: 0; }
`;

export const Wrap = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[6]}`};
  background: radial-gradient(
    900px 500px at 50% -10%,
    ${({ theme }) => theme.color.success[50]} 0%,
    ${({ theme }) => theme.color.bg.app} 55%
  );
  min-height: 100vh;
`;

export const Card = styled.div`
  max-width: 680px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[5]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius['2xl']};
  padding: ${({ theme }) => `${theme.space[10]} ${theme.space[8]}`};
  text-align: center;
  align-items: center;
  box-shadow: ${({ theme }) => theme.shadow.lg};
`;

export const SealBadge = styled.div`
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: linear-gradient(
    145deg,
    ${({ theme }) => theme.color.success[500]},
    ${({ theme }) => theme.color.success[700]}
  );
  color: ${({ theme }) => theme.color.bg.surface};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow:
    0 8px 24px rgba(16, 185, 129, 0.35),
    0 0 0 6px rgba(16, 185, 129, 0.12);
  animation: ${sealPop} 520ms cubic-bezier(0.5, 1.8, 0.5, 1) both;

  &::after {
    content: '';
    position: absolute;
    inset: -4px;
    border-radius: ${({ theme }) => theme.radius.pill};
    border: 2px solid ${({ theme }) => theme.color.success[500]};
    animation: ${rippleOut} 1600ms ease-out infinite;
  }
`;

export const Kicker = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.1em;
  color: ${({ theme }) => theme.color.success[700]};
  text-transform: uppercase;
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: -0.02em;
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: 1.15;
`;

export const Body = styled.p`
  margin: 0;
  max-width: 48ch;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const DocMeta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  align-items: center;
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bg.sunken};
  width: 100%;
  max-width: 440px;
  text-align: left;
`;

export const DocInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
  flex: 1;
`;

export const DocTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const DocCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const SignersCaption = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-top: ${({ theme }) => theme.space[2]};
`;

export const SignerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  width: 100%;
  max-width: 440px;
`;

export const SignerItem = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  background: ${({ theme }) => theme.color.bg.sunken};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  text-align: left;
`;

export const SignerMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
`;

export const SignerName = styled.span`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const SignerEmail = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const DeliveredChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[700]};
  font-size: 11px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  padding: 3px 8px;
  border-radius: ${({ theme }) => theme.radius.pill};
`;

export const AuditBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[800]};
  border-radius: ${({ theme }) => theme.radius.pill};
  font-size: 12px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
  justify-content: center;
  margin-top: ${({ theme }) => theme.space[2]};
`;

// Legacy name kept for backwards compatibility with older imports. Prefer
// `SealBadge` in new code.
export const SealIcon = SealBadge;
