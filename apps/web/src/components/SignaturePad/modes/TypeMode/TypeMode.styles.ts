import styled from 'styled-components';

export const Wrap = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
`;

export const Preview = styled.div`
  min-height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.script};
  font-size: 44px;
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px dashed ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;
