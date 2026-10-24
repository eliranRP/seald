import styled from 'styled-components';

export const Text = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[2]};
`;
