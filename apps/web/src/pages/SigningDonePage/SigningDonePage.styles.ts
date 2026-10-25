import styled from 'styled-components';

/**
 * Download and "Save a copy": in the status column on desktop; a full-width
 * stack 8px apart on mobile (canvas Sign-M-done `.btn-block`).
 */
export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};

  @media (max-width: 640px) {
    align-self: stretch;
    align-items: stretch;
    gap: ${({ theme }) => theme.space[2]};

    & > a:last-child {
      min-height: 44px;
    }
  }
`;

export const Hint = styled.p<{ readonly $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.micro};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme, $error }) => ($error ? theme.color.danger[700] : theme.color.fg[3])};
`;
