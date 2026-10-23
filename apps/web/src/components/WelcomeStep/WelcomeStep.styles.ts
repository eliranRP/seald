import styled from 'styled-components';

export const Verified = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  overflow-wrap: anywhere;

  & > span:first-child {
    display: inline-flex;
    color: ${({ theme }) => theme.color.success[700]};
  }
`;

export const TermsRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};

  & a {
    color: ${({ theme }) => theme.color.indigo[600]};
    text-underline-offset: 2px;
  }
`;

export const TermsBox = styled.input`
  flex: none;
  width: 18px;
  height: 18px;
  margin: 2px 0 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
  }
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;
