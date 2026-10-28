import styled from 'styled-components';

const TABLET = '(max-width: 768px)';

/** Canvas `.meta` in `fg-2` with the green check. */
export const Verified = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.font.size.caption};
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

  /* A 44px row with a 20px box on a phone. */
  @media ${TABLET} {
    align-items: center;
    gap: 12px;
    min-height: 44px;
  }
`;

/** Canvas `.checkbox`: 16px, 20px on a phone. */
export const TermsBox = styled.input`
  flex: none;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: ${({ theme }) => theme.color.indigo[600]};
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
  }

  @media ${TABLET} {
    width: 20px;
    height: 20px;
  }
`;

/** Terms row plus its inline error, tight like a TextField's feedback. */
export const TermsField = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

/** Same ink and size as TextField's error line. */
export const TermsError = styled.span`
  font-size: ${({ theme }) => theme.font.size.xs};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;
