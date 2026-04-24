import styled from 'styled-components';

export const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(11, 18, 32, 0.5);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: flex-end;
  justify-content: center;
`;

export const Sheet = styled.div`
  width: 100%;
  max-width: 560px;
  background: ${({ theme }) => theme.color.paper};
  border-radius: 20px 20px 0 0;
  padding: ${({ theme }) => theme.space[6]} 28px 28px;
  box-shadow: 0 -10px 40px rgba(11, 18, 32, 0.2);
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

export const CloseBtn = styled.button`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: transparent;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  cursor: pointer;
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const Input = styled.input<{ readonly $invalid: boolean }>`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.color.danger[500] : theme.color.border[2])};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-family: ${({ theme }) => theme.font.sans};
  box-sizing: border-box;
  &:focus-visible {
    outline: none;
    border-color: ${({ theme }) => theme.color.indigo[500]};
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const ErrorText = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.danger[700]};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[5]};
`;

export const CancelBtn = styled.button`
  padding: 10px 16px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[2]};
  cursor: pointer;
`;

export const ApplyBtn = styled.button`
  padding: 10px 18px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.ink[900]};
  color: ${({ theme }) => theme.color.paper};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  cursor: pointer;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;
