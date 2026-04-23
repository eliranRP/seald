import styled from 'styled-components';

export const Root = styled.div`
  padding: ${({ theme }) => `${theme.space[12]} ${theme.space[5]}`};
  text-align: center;
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 14px;
`;
