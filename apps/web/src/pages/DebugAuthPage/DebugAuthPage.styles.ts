import styled from 'styled-components';

export const Wrap = styled.div`
  flex: 1 1 auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: ${({ theme }) => theme.space[12]};
`;

export const Card = styled.div`
  max-width: 640px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.xl};
  padding: ${({ theme }) => theme.space[8]};
`;

export const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Status = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
`;

export const Result = styled.pre`
  margin: 0;
  padding: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.bg.sunken};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[1]};
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
`;
