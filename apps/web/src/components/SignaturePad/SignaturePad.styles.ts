import styled, { css } from 'styled-components';

export const Root = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[4]};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
`;

export const TabList = styled.div`
  display: inline-flex;
  gap: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => theme.space[1]};
  background: ${({ theme }) => theme.color.bg.subtle};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  width: fit-content;
`;

export const Tab = styled.button<{ readonly $selected: boolean }>`
  appearance: none;
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[4]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  border: 1px solid transparent;
  background: transparent;
  color: ${({ theme }) => theme.color.fg[2]};
  transition: background ${({ theme }) => theme.motion.durFast}
    ${({ theme }) => theme.motion.easeStandard};

  ${({ $selected, theme }) =>
    $selected
      ? css`
          background: ${theme.color.paper};
          color: ${theme.color.fg[1]};
          border-color: ${theme.color.border[1]};
          box-shadow: ${theme.shadow.xs};
        `
      : css`
          &:hover {
            background: ${theme.color.bg.surface};
            color: ${theme.color.fg[1]};
          }
        `}

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Panel = styled.div`
  display: block;
`;
