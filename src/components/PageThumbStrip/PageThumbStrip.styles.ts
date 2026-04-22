import styled from 'styled-components';

export const Nav = styled.nav`
  display: flex;
  gap: 6px;
  justify-content: center;
  margin-top: ${({ theme }) => theme.space[5]};
`;

export const Thumb = styled.button<{ readonly $active: boolean }>`
  width: 34px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.xs};
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1.5px solid
    ${({ $active, theme }) => ($active ? theme.color.indigo[600] : theme.color.border[1])};
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-size: 10px;
  font-family: ${({ theme }) => theme.font.mono};
  color: ${({ $active, theme }) => ($active ? theme.color.indigo[700] : theme.color.fg[3])};
  padding: 0 0 3px;
  cursor: pointer;
  position: relative;
  appearance: none;
  line-height: 1;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const FieldDot = styled.span`
  position: absolute;
  top: 3px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.indigo[600]};
`;
