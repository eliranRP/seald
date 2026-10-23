import styled from 'styled-components';

export const Shell = styled.div`
  width: 100%;
  min-height: 60vh;
  display: grid;
  place-items: center;
  background: ${({ theme }) => theme.color.bg.app};
`;

export const IdRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

export const ErrorId = styled.code`
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.fg[3]};
`;
