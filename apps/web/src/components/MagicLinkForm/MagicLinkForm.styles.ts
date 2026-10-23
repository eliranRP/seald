import styled from 'styled-components';

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

export const Guest = styled.div`
  text-align: center;
`;

export const GuestLink = styled.button`
  min-height: 44px;
  padding: 0 8px;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[700]};
  text-underline-offset: 2px;

  &:hover {
    text-decoration: underline;
  }
  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }
`;
