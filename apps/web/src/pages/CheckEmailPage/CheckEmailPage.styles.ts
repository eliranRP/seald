import styled from 'styled-components';

export const Wrap = styled.div`
  text-align: left;
`;

export const IconBadge = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.space[5]};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 32px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.15;
  margin: 0;
`;

export const Body = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[3]} 0 0;
  line-height: 1.6;
`;

export const Actions = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  display: flex;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Secondary = styled.button`
  flex: 1;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
`;

export const Primary = styled.button`
  flex: 1;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  border: none;
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
`;
