import styled from 'styled-components';

/** Joins two primary buttons into one control: the main action and a chevron. */
export const Group = styled.div<{ $full: boolean }>`
  display: ${({ $full }) => ($full ? 'flex' : 'inline-flex')};
  width: ${({ $full }) => ($full ? '100%' : 'auto')};

  & > button:first-child {
    flex: 1;
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }
  & > button:last-child {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    border-left: 1px solid ${({ theme }) => theme.color.indigo[400]};
  }
`;
