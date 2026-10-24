import styled from 'styled-components';

export const Pad = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 96px;
  overflow: hidden;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};

  @media (max-width: 640px) {
    margin-bottom: 10px;
  }

  img {
    max-width: 80%;
    max-height: 72px;
    object-fit: contain;
  }
`;

/** Canvas finish modal: preview, heading and meta lines 12px apart. */
export const Stack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};

  /* Sheet: 16px under the preview, then lines 6px apart. */
  @media (max-width: 640px) {
    gap: 6px;
  }
`;

/** Canvas `.h2` (24px) in the modal, `.h3` (16px semibold) in the sheet. */
export const Heading = styled.h3`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.x2l};
  line-height: ${({ theme }) => theme.font.lineHeight.snug};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};

  @media (max-width: 640px) {
    font-family: ${({ theme }) => theme.font.sans};
    font-size: ${({ theme }) => theme.font.size.body};
    font-weight: ${({ theme }) => theme.font.weight.semibold};
  }
`;

export const Meta = styled.p`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.caption};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
`;
