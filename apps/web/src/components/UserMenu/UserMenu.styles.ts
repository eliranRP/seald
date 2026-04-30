import styled from 'styled-components';

export const Root = styled.div`
  position: relative;
  display: inline-flex;
`;

export const Trigger = styled.button`
  appearance: none;
  background: transparent;
  border: none;
  padding: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Menu = styled.div`
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  min-width: 220px;
  background: ${({ theme }) => theme.color.paper};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  box-shadow: ${({ theme }) => theme.shadow.lg};
  z-index: ${({ theme }) => theme.z.overlay};
  padding: ${({ theme }) => theme.space[2]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Header = styled.div`
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
  margin-bottom: ${({ theme }) => theme.space[1]};
`;

export const Name = styled.div`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Email = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

export const Item = styled.button<{ $danger?: boolean }>`
  appearance: none;
  text-align: left;
  background: transparent;
  border: none;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
  border-radius: ${({ theme }) => theme.radius.sm};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme, $danger }) => ($danger ? theme.color.danger[700] : theme.color.fg[1])};
  cursor: pointer;
  &:hover {
    background: ${({ theme, $danger }) =>
      $danger ? theme.color.danger[50] : theme.color.ink[100]};
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

export const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.color.border[1]};
  margin: ${({ theme }) => `${theme.space[1]} 0`};
`;
