import styled from 'styled-components';

export const Root = styled.article`
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[5]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
  transition:
    border-color ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard},
    box-shadow ${({ theme }) => theme.motion.durFast} ${({ theme }) => theme.motion.easeStandard};
  &:hover,
  &:focus-within {
    border-color: ${({ theme }) => theme.color.indigo[300]};
    box-shadow: ${({ theme }) => theme.shadow.md};
  }
`;

export const Top = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[5]};
  align-items: flex-start;
`;

export const CoverWrap = styled.div`
  position: relative;
  width: 92px;
  height: 116px;
  flex-shrink: 0;
`;

export const CoverPaper = styled.div`
  position: absolute;
  inset: 0;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xs};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
`;

export const CoverStripe = styled.div<{ $color: string }>`
  height: 5px;
  border-radius: 2px;
  background: ${({ $color }) => $color};
  width: 60%;
`;

export const CoverLines = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  flex: 1;
`;

export const CoverLine = styled.div<{ $width: number }>`
  height: 2px;
  border-radius: 1px;
  background: ${({ theme }) => theme.color.ink[150]};
  width: ${({ $width }) => `${$width}%`};
`;

export const CoverInitial = styled.div`
  position: absolute;
  top: 12px;
  right: 10px;
  width: 18px;
  height: 12px;
  border-radius: 3px;
  background: ${({ theme }) => theme.color.indigo[100]};
  border: 1px solid ${({ theme }) => theme.color.indigo[300]};
`;

export const CoverSig = styled.div`
  position: absolute;
  bottom: 12px;
  left: 10px;
  right: 38px;
  height: 14px;
  border-radius: 3px;
  background: ${({ theme }) => theme.color.indigo[100]};
  border: 1px solid ${({ theme }) => theme.color.indigo[300]};
`;

export const CoverPages = styled.div`
  position: absolute;
  bottom: 6px;
  right: 8px;
  font-size: 9px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
  padding-top: ${({ theme }) => theme.space[1]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Code = styled.div`
  font-size: 11px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Name = styled.h3`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 18px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 0;
`;

export const Meta = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[4]};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const MetaItem = styled.span`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  padding-top: ${({ theme }) => theme.space[3]};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const FooterStat = styled.span`
  flex: 1;
  min-width: 0;
  & > b {
    color: ${({ theme }) => theme.color.fg[1]};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
  & > code {
    font-family: ${({ theme }) => theme.font.mono};
    color: ${({ theme }) => theme.color.fg[2]};
    background: transparent;
    padding: 0;
  }
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
  flex-shrink: 0;
`;
