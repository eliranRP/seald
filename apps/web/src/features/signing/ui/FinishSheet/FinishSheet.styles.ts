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

  img {
    max-width: 80%;
    max-height: 72px;
    object-fit: contain;
  }
`;

export const Heading = styled.h3`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.xl};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
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
