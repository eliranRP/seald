import styled from 'styled-components';

export const Hint = styled.p<{ readonly $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.micro};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme, $error }) => ($error ? theme.color.danger[700] : theme.color.fg[3])};
`;
