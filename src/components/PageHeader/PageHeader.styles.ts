import styled from 'styled-components';

export const Root = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[6]};
`;

export const TitleBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
  min-width: 0;
`;

export const Eyebrow = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const Actions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
`;
