import styled from 'styled-components';

export const Wrap = styled.div`
  flex: 1 1 auto;
  overflow: auto;
  background: ${({ theme }) => theme.color.ink[100]};
  padding: ${({ theme }) => theme.space[10]} ${({ theme }) => theme.space[6]};
  display: flex;
  justify-content: center;
`;

export const Envelope = styled.div`
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const DocCard = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  align-items: center;
  padding: ${({ theme }) => theme.space[4]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

export const DocPreview = styled.div`
  width: 48px;
  height: 60px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  flex-shrink: 0;
`;

export const DocMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const DocName = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DocSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const CTA = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.fg.inverse};
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[5]}`};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  font-size: 14px;
  align-self: flex-start;
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.indigo[700]};
  }
`;

export const Trust = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 13px;
`;

export const Foot = styled.div`
  text-align: center;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const SealedRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
`;

export const SignerLine = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: 14px;
  color: ${({ theme }) => theme.color.fg[2]};
`;

export const Emerald = styled.span`
  color: ${({ theme }) => theme.color.success[500]};
  display: inline-flex;
  align-items: center;
`;

export const ActionRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
`;

export const SignalRow = styled.div`
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const BackButton = styled.button`
  appearance: none;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  font-family: ${({ theme }) => theme.font.sans};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  &:hover {
    background: ${({ theme }) => theme.color.bg.surface};
  }
`;

export const LoadingState = styled.div`
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
  text-align: center;
`;
