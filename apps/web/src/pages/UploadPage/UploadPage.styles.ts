import styled, { css } from 'styled-components';

export const Shell = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: ${({ theme }) => theme.color.bg.app};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Body = styled.div`
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
`;

export const Main = styled.main`
  flex: 1 1 auto;
  min-width: 0;
  overflow: auto;
  padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[12]}
    ${({ theme }) => theme.space[20]};
`;

export const Inner = styled.div`
  max-width: 960px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[8]};
`;

export const Heading = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h1};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
  color: ${({ theme }) => theme.color.fg[1]};
  margin: 0;
`;

export const Subtitle = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme }) => theme.color.fg[3]};
  max-width: 58ch;
`;

export const Dropzone = styled.div<{ readonly $dragging: boolean }>`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px dashed ${({ theme }) => theme.color.indigo[300]};
  border-radius: ${({ theme }) => theme.radius['2xl']};
  padding: ${({ theme }) => theme.space[16]} ${({ theme }) => theme.space[8]};
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[5]};
  transition:
    background ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard},
    border-color ${({ theme }) => theme.motion.durBase} ${({ theme }) => theme.motion.easeStandard};

  ${({ $dragging, theme }) =>
    $dragging &&
    css`
      background: ${theme.color.indigo[50]};
      border-color: ${theme.color.indigo[500]};
    `}

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const IconCircle = styled.div`
  width: 64px;
  height: 64px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[600]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

export const DropHeading = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h3};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const DropSubheading = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Actions = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[3]};
  margin-top: ${({ theme }) => theme.space[3]};
`;

export const HiddenFileInput = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

export const ErrorText = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.danger[700]};
`;
