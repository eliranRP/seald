import styled from 'styled-components';

export const Page = styled.div<{ readonly $width: number }>`
  position: relative;
  width: ${({ $width }) => `${$width}px`};
  min-height: 740px;
  background: ${({ theme }) => theme.color.paper};
  border-radius: ${({ theme }) => theme.radius.xs};
  box-shadow: ${({ theme }) => theme.shadow.paper};
  padding: 56px 64px;
  overflow: hidden;
`;

export const Heading = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const PageTag = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.mono};
  margin-top: 4px;
`;

export const Spacer = styled.div`
  height: ${({ theme }) => theme.space[4]};
`;

export const Line = styled.div<{ readonly $width: number }>`
  height: 6px;
  border-radius: 2px;
  background: ${({ theme }) => theme.color.ink[150]};
  margin: 8px 0;
  width: ${({ $width }) => `${$width}%`};
`;

export const PdfCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: auto;
`;

export const PreviewWarning = styled.div`
  margin-bottom: ${({ theme }) => theme.space[2]};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  background: ${({ theme }) => theme.color.warn[50]};
  border: 1px solid ${({ theme }) => theme.color.warn[500]};
  color: ${({ theme }) => theme.color.warn[700]};
  font-size: ${({ theme }) => theme.font.size.micro};
  border-radius: ${({ theme }) => theme.radius.xs};
`;

export const FieldLayer = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  & > * {
    pointer-events: auto;
  }
`;
