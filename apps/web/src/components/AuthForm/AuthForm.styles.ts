import styled from 'styled-components';
import { ErrorBanner as SharedErrorBanner } from '@/components/shared/ErrorBanner';

export const Heading = styled.div`
  margin-bottom: ${({ theme }) => theme.space[6]};
`;

export const Title = styled.h1`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 36px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
`;

export const Subtitle = styled.p`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  margin: ${({ theme }) => theme.space[2]} 0 0;
  line-height: 1.55;
`;

export const Form = styled.form`
  display: block;
`;

export const CheckboxRow = styled.label`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0 0 ${({ theme }) => theme.space[5]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  user-select: none;
`;

export const TosRow = styled.label`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
  margin: ${({ theme }) => theme.space[2]} 0 ${({ theme }) => theme.space[5]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  line-height: 1.5;
`;

export const Checkbox = styled.input`
  /* min-width + flex-shrink: 0 keep both checkboxes visually identical
     even when their adjacent text wraps to a different number of lines.
     Without these, the longer-text row's flex layout was squeezing the
     checkbox a few px narrower, making the two rows look mismatched. */
  width: 18px;
  height: 18px;
  min-width: 18px;
  flex-shrink: 0;
  accent-color: ${({ theme }) => theme.color.ink[900]};
  cursor: pointer;
`;

export const ErrorBanner = styled(SharedErrorBanner)`
  margin: 0 0 ${({ theme }) => theme.space[4]};
`;

export const Submit = styled.button`
  width: 100%;
  height: 46px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.fg.inverse};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Footer = styled.div`
  margin-top: ${({ theme }) => theme.space[5]};
  text-align: center;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  a,
  button.link {
    color: ${({ theme }) => theme.color.indigo[600]};
    text-decoration: none;
    font-weight: ${({ theme }) => theme.font.weight.semibold};
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-family: inherit;
    font-size: inherit;
  }
`;

export const SkipRow = styled.div`
  margin-top: ${({ theme }) => theme.space[8]};
  padding-top: ${({ theme }) => theme.space[5]};
  border-top: 1px dashed ${({ theme }) => theme.color.border[1]};
  text-align: center;
`;

export const SkipButton = styled.button`
  display: inline-flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  padding: 8px 14px;
  background: transparent;
  border: none;
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  border-radius: ${({ theme }) => theme.radius.sm};
  &:hover:not(:disabled) {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[100]};
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const SkipHint = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[4]};
`;
