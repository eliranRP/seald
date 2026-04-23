import styled, { css } from 'styled-components';

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
  padding: 32px 24px 20px;
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Title = styled.h2`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  text-align: center;
  margin: 0 0 20px 0;
`;

export const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 220px;
  gap: ${({ theme }) => theme.space[6]};
  align-items: flex-start;
`;

export const RadioColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const RadioLabel = styled.label<{ $selected: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  cursor: pointer;
  padding: 4px 0;
  font-size: 15px;
  color: ${({ theme, $selected }) => ($selected ? theme.color.fg[1] : theme.color.fg[2])};
  font-weight: ${({ theme, $selected }) =>
    $selected ? theme.font.weight.semibold : theme.font.weight.medium};
`;

export const RadioCircle = styled.span<{ $selected: boolean }>`
  width: 20px;
  height: 20px;
  border-radius: ${({ theme }) => theme.radius.pill};
  border: 1.75px solid
    ${({ theme, $selected }) => ($selected ? theme.color.success[500] : theme.color.border[2])};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

export const RadioDot = styled.span`
  width: 10px;
  height: 10px;
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.success[500]};
`;

export const HiddenInput = styled.input`
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

export const CustomInput = styled.input`
  margin-top: 4px;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: 10px;
  font-size: 14px;
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  background: ${({ theme }) => theme.color.bg.surface};
  outline: none;
  &:focus-visible {
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const CurrentPage = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 10px;
  line-height: 1.5;
`;

export const CurrentPageNumber = styled.b`
  color: ${({ theme }) => theme.color.fg[1]};
  font-family: ${({ theme }) => theme.font.mono};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

export const HintCard = styled.div`
  background: ${({ theme }) => theme.color.indigo[50]};
  border: 1px solid ${({ theme }) => theme.color.indigo[200]};
  border-radius: 10px;
  padding: 14px 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.indigo[800]};
  line-height: 1.55;
`;

export const Footer = styled.div`
  border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  margin: 20px -24px 0;
  padding: 14px 24px 0;
  display: flex;
  justify-content: flex-end;
  gap: 14px;
  align-items: center;
`;

export const CancelButton = styled.button`
  ${({ theme }) => css`
    background: transparent;
    border: none;
    color: ${theme.color.fg[2]};
    font-size: 14px;
    font-weight: ${theme.font.weight.semibold};
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
    padding: 8px 6px;
    font-family: ${theme.font.sans};
    &:focus-visible {
      outline: none;
      box-shadow: ${theme.shadow.focus};
      border-radius: 4px;
    }
  `}
`;
