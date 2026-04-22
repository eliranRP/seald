import styled from 'styled-components';

export const Paper = styled.div`
  width: 560px;
  min-height: 740px;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xs};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  padding: 56px 64px;
  position: relative;
  margin: 0 auto;
  user-select: none;
  box-sizing: border-box;
`;

export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DocMeta = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 11px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[1]};
`;

export const HeaderGap = styled.div`
  height: 18px;
`;

export const ContentRow = styled.div<{ readonly $widthPct: number }>`
  height: 6px;
  border-radius: 2px;
  background: ${({ theme }) => theme.color.ink[150]};
  margin: ${({ theme }) => theme.space[2]} 0;
  width: ${({ $widthPct }) => `${$widthPct}%`};
`;

export const SignatureLinesWrap = styled.div`
  position: absolute;
  left: 64px;
  right: 64px;
  top: 540px;
  display: flex;
  flex-direction: column;
  gap: 28px;
`;

export const SignatureLineRow = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
`;

export const SignatureLineCell = styled.div`
  flex: 1;
`;

export const SignatureLineRule = styled.div`
  border-bottom: 1.5px solid ${({ theme }) => theme.color.ink[300]};
  height: 54px;
`;

export const SignatureLineCaption = styled.div`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 10px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: ${({ theme }) => theme.space[1]};
  letter-spacing: 0.04em;
`;
