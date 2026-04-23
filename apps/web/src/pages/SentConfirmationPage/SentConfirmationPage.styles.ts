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

export const SealIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.success[50]};
  color: ${({ theme }) => theme.color.success[500]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
`;

export const DocInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

export const DocTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: 14px;
`;

export const DocCode = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const SignerList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

export const SignerItem = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[2]};
`;

export const SignerMeta = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const SignerName = styled.span`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const SignerEmail = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
  flex-wrap: wrap;
`;
