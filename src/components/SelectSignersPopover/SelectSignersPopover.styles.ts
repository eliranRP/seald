import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: ${({ theme }) => theme.z.modal};
  background: rgba(15, 23, 42, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

export const Card = styled.div`
  width: 560px;
  max-width: 100%;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: ${({ theme }) => `${theme.space[8]} ${theme.space[6]} ${theme.space[5]}`};
`;

export const Title = styled.h2`
  margin: 0 0 ${({ theme }) => theme.space[5]};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: center;
`;

export const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0 ${({ theme }) => theme.space[2]};
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
`;

export const Row = styled.li`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => `${theme.space[1]} ${theme.space[1]}`};
`;

export const RowButton = styled.button`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  width: 100%;
  background: transparent;
  border: none;
  padding: ${({ theme }) => theme.space[1]};
  cursor: pointer;
  font-family: ${({ theme }) => theme.font.sans};
  text-align: left;

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;

export const CheckBox = styled.span<{ $checked: boolean }>`
  width: 22px;
  height: 22px;
  border-radius: ${({ theme }) => theme.radius.xs};
  border: 1.5px solid
    ${({ $checked, theme }) => ($checked ? theme.color.success[500] : theme.color.border[2])};
  background: ${({ $checked, theme }) =>
    $checked ? theme.color.success[500] : theme.color.bg.surface};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.fg.inverse};
  flex-shrink: 0;
`;

export const ColorDot = styled.span<{ $color: string }>`
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ $color }) => $color};
  flex-shrink: 0;
`;

export const RowName = styled.span`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: ${({ theme }) => `${theme.space[5]} -${theme.space[6]} 0`};
  padding: ${({ theme }) => `${theme.space[4]} ${theme.space[6]} 0`};
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
`;

export const CancelButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.color.fg[2]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: ${({ theme }) => `${theme.space[2]} ${theme.space[1]}`};

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
    border-radius: ${({ theme }) => theme.radius.sm};
  }
`;
