import styled from 'styled-components';

const TABLET = '(max-width: 768px)';

export const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

/** Canvas `.or-row`: 13px "or" between two hairlines, 12px apart. */
export const OrRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${({ theme }) => theme.color.border[1]};
  }
`;

export const Guest = styled.div`
  text-align: center;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

/**
 * Desktop: a 13px underlined link (canvas `.meta` with an indigo anchor).
 * Phone: a 44px, 14px medium target.
 */
export const GuestLink = styled.button`
  padding: 0;
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  color: ${({ theme }) => theme.color.indigo[600]};
  text-decoration: underline;
  text-underline-offset: 2px;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.accent.base};
    outline-offset: 2px;
    border-radius: ${({ theme }) => theme.radius.xs};
  }

  @media ${TABLET} {
    width: 100%;
    min-height: 44px;
    font-size: ${({ theme }) => theme.font.size.bodySm};
    font-weight: ${({ theme }) => theme.font.weight.medium};
    text-decoration: none;
  }
`;
