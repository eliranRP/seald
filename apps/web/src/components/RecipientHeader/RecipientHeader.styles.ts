import styled from 'styled-components';

export const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: ${({ theme }) => theme.z.sticky};
  height: 60px;
  min-height: 60px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  display: flex;
  align-items: center;
  padding: 0 ${({ theme }) => theme.space[6]};
  gap: ${({ theme }) => theme.space[5]};

  /* Mobile: tighter padding/gaps so the doc title (the most useful piece
     of context for a signer on a small screen) gets the full middle. */
  @media (max-width: 768px) {
    padding: 0 ${({ theme }) => theme.space[3]};
    gap: ${({ theme }) => theme.space[3]};
  }
`;

export const LogoSlot = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.fg[1]};
  flex-shrink: 0;
`;

export const Divider = styled.span`
  display: inline-block;
  width: 1px;
  height: 18px;
  background: ${({ theme }) => theme.color.border[1]};
  flex-shrink: 0;
`;

export const MiddleStack = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-width: 0;
`;

export const Title = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const Meta = styled.span`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const StepChip = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 4px ${({ theme }) => theme.space[3]};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  letter-spacing: 0.02em;
  flex-shrink: 0;
`;

export const DownloadButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  flex-shrink: 0;
  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[100]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;

export const ExitButton = styled.button`
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  flex-shrink: 0;
  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[100]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
