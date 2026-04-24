import styled from 'styled-components';

export const Page = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.ink[100]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const ActionBar = styled.div`
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  padding: 12px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  position: sticky;
  top: 60px;
  z-index: ${({ theme }) => theme.z.sticky};
`;

export const ProgressWrap = styled.div`
  flex: 1;
  max-width: 420px;
  display: flex;
  align-items: center;
  gap: 12px;
`;

export const ProgressCount = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  white-space: nowrap;
`;

export const Spacer = styled.div`
  flex: 1;
`;

export const NextBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.indigo[600]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const ReviewBtn = styled.button`
  height: 36px;
  padding: 0 16px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.success[500]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
`;

export const DeclineBtn = styled.button`
  height: 36px;
  padding: 0 14px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;

export const PagesStack = styled.div`
  flex: 1;
  overflow: auto;
  padding: 24px 0 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
`;

export const ErrorBanner = styled.div`
  margin: 12px 24px 0;
  background: ${({ theme }) => theme.color.danger[50]};
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.caption};
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radius.sm};
`;
