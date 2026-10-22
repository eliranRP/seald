import styled from 'styled-components';

export {
  ApplyBtn,
  Backdrop,
  CancelBtn,
  CloseBtn,
  ErrorText,
  Footer,
  HeaderRow,
  Input,
  Sheet,
  Title,
} from '@/components/FieldInputDrawer/FieldInputDrawer.styles';

export const Select = styled.select<{ readonly $invalid: boolean }>`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.color.danger[500] : theme.color.border[2])};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-family: ${({ theme }) => theme.font.sans};
  box-sizing: border-box;
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Hint = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

export const RadioList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
  max-height: 40vh;
  overflow-y: auto;
`;

export const RadioRow = styled.label`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-family: ${({ theme }) => theme.font.sans};
  color: ${({ theme }) => theme.color.fg[1]};
  cursor: pointer;
`;
