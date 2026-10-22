import styled from 'styled-components';

export const Root = styled.section`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[3]};
  padding: ${({ theme }) => theme.space[3]};
  margin-bottom: ${({ theme }) => theme.space[3]};
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-family: ${({ theme }) => theme.font.sans};
`;

export const Heading = styled.h3`
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const Row = styled.div`
  display: grid;
  gap: ${({ theme }) => theme.space[1]};
`;

export const Pair = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.space[2]};
`;

export const Label = styled.label`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[2]};
`;

const controlBase = `
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  box-sizing: border-box;
  font: inherit;
  font-size: 13px;
`;

export const TextInput = styled.input<{ readonly $invalid?: boolean }>`
  ${controlBase}
  border: 1px solid
    ${({ theme, $invalid }) =>
    $invalid === true ? theme.color.danger[500] : theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Select = styled.select<{ readonly $invalid?: boolean }>`
  ${controlBase}
  border: 1px solid
    ${({ theme, $invalid }) =>
    $invalid === true ? theme.color.danger[500] : theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const CheckRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const ErrorText = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const OptionList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const OptionItem = styled.li`
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: ${({ theme }) => theme.space[2]};
  align-items: start;
`;

export const SmallButton = styled.button`
  min-height: 32px;
  padding: 4px 10px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.paper};
  font: inherit;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;
