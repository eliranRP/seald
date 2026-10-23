import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';

export const Root = styled.form`
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Lead = styled.p`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  line-height: 1.6;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const Email = styled.strong`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const Field = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
  text-align: left;
`;

export const Label = styled.label`
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const CodeInput = styled.input<{ readonly $invalid: boolean }>`
  width: 100%;
  min-height: ${({ theme }) => theme.space[12]};
  padding: 0 ${({ theme }) => theme.space[3]};
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.color.danger[500] : theme.color.border[2])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.mono};
  font-size: ${({ theme }) => theme.font.size.h3};
  letter-spacing: 0.4em;
  text-align: center;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Hint = styled.span`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const ErrorBanner = styled(SharedErrorBanner)`
  text-align: left;
`;

export const Actions = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[2]};
`;

export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;
