import styled, { css } from 'styled-components';
import type { TemplateModeBannerTone } from './TemplateModeBanner.types';

export const Wrap = styled.div<{ $tone: TemplateModeBannerTone }>`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: ${({ theme }) => theme.radius.md};
  font-family: ${({ theme }) => theme.font.sans};

  ${({ $tone, theme }) =>
    $tone === 'success'
      ? css`
          background: ${theme.color.success[50]};
          color: ${theme.color.success[700]};
          border: 1px solid ${theme.color.success[500]};
        `
      : css`
          background: ${theme.color.indigo[50]};
          color: ${theme.color.indigo[700]};
          border: 1px solid ${theme.color.indigo[300]};
        `}
`;

export const IconWrap = styled.span`
  display: inline-flex;
  flex-shrink: 0;
  margin-top: 2px;
`;

export const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

export const Title = styled.div`
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  line-height: 1.4;
`;

export const Subtitle = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 4px;
  line-height: 1.5;
`;

export const DismissButton = styled.button`
  background: transparent;
  border: none;
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  flex-shrink: 0;

  &:hover,
  &:focus-visible {
    color: ${({ theme }) => theme.color.fg[1]};
    background: ${({ theme }) => theme.color.ink[100]};
  }
`;
