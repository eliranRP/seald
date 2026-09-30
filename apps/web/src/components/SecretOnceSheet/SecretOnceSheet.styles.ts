import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.color.overlay};
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};

  @media (max-width: 640px) {
    align-items: flex-end;
    padding: 0;
  }
`;

export const Card = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => theme.space[6]};
  width: 100%;
  max-width: 440px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};

  @media (max-width: 640px) {
    max-width: none;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  }
`;

export const Secret = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.space[3]};
  background: ${({ theme }) => theme.color.bg.sunken};
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[1]};
  word-break: break-all;
  direction: ltr;
  unicode-bidi: isolate;
  user-select: text;
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};

  @media (max-width: 640px) {
    flex-direction: column;

    button:first-of-type {
      width: 100%;
    }
  }
`;

export const Status = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.fg[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
`;

export const Alert = styled.p`
  margin: 0;
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export const ConfirmBackdrop = styled(Backdrop)`
  z-index: ${({ theme }) => theme.z.toast};
`;
