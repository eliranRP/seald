import styled from 'styled-components';

/** Full-screen layer over the app. The review inside scrolls with it. */
export const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  overflow-y: auto;
  background: ${({ theme }) => theme.color.bg.app};

  &:focus {
    outline: none;
  }
`;
