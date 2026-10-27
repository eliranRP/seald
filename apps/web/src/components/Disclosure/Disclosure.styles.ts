import styled from 'styled-components';

export const Toggle = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[1]};
  min-height: 44px;
  /* Flush left so the chevron lines up with the column edge; the 44px
     height keeps the touch target. */
  padding: 0 ${({ theme }) => theme.space[2]} 0 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;
