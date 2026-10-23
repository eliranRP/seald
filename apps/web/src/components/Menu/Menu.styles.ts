import styled, { css } from 'styled-components';
import { drop } from '@/styles/motion';

export const MenuAnchor = styled.div`
  position: relative;
  display: inline-flex;
`;

export const MenuSurface = styled.div<{ $align: 'start' | 'end' }>`
  position: absolute;
  top: calc(100% + 4px);
  ${({ $align }) =>
    $align === 'end'
      ? css`
          right: 0;
        `
      : css`
          left: 0;
        `}
  z-index: ${({ theme }) => theme.z.overlay};
  min-width: 220px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  ${drop}
  transform-origin: ${({ $align }) => ($align === 'end' ? 'top right' : 'top left')};
`;

export const MenuHeader = styled.div`
  padding: 8px 10px 10px;
  margin-bottom: 6px;
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

export const MenuItemButton = styled.button<{ $danger: boolean; $checked: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme, $checked }) =>
    $checked ? theme.font.weight.semibold : theme.font.weight.regular};
  color: ${({ theme, $danger, $checked }) => {
    if ($danger) return theme.color.danger[700];
    if ($checked) return theme.color.indigo[800];
    return theme.color.fg[1];
  }};
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};
  &:hover:not(:disabled),
  &:focus-visible {
    background: ${({ theme, $danger }) =>
      $danger ? theme.color.danger[50] : theme.color.bg.subtle};
  }
  &:focus-visible {
    outline: 0;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

export const MenuItemLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const MenuCheck = styled.span`
  display: inline-flex;
  margin-left: auto;
`;

export const MenuSep = styled.div`
  height: 1px;
  margin: 6px 0;
  background: ${({ theme }) => theme.color.border[1]};
`;

export const MenuLabel = styled.div`
  padding: 8px 10px 4px;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.xs};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
`;
