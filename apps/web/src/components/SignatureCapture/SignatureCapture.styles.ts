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
  max-width: 680px;
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

export const Eyebrow = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  letter-spacing: 0.08em;
  color: ${({ theme }) => theme.color.fg[3]};
  text-transform: uppercase;
`;

export const Title = styled.div`
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h4};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  margin-top: 4px;
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

export const Tabs = styled.div`
  display: flex;
  gap: 4px;
  padding: 4px;
  background: ${({ theme }) => theme.color.ink[100]};
  border-radius: ${({ theme }) => theme.radius.md};
  margin-bottom: ${({ theme }) => theme.space[4]};
  width: fit-content;
`;

export const Tab = styled.button<{ readonly $active: boolean }>`
  padding: 6px 14px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.sm};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  background: ${({ theme, $active }) => ($active ? theme.color.paper : 'transparent')};
  color: ${({ theme, $active }) => ($active ? theme.color.fg[1] : theme.color.fg[3])};
  cursor: pointer;
  box-shadow: ${({ theme, $active }) => ($active ? theme.shadow.sm : 'none')};
  text-transform: capitalize;
  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

export const TextInput = styled.input`
  width: 100%;
  padding: 12px 16px;
  border: 1px solid ${({ theme }) => theme.color.border[2]};
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

export const PreviewPanel = styled.div`
  margin-top: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100px;
`;

export const InitialScript = styled.span`
  font-family: ${({ theme }) => theme.font.script};
  font-size: 54px;
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.medium};
`;

export const DrawCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: 180px;
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  touch-action: none;
  cursor: crosshair;
`;

export const DrawHint = styled.div`
  margin-top: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[4]};
  font-family: ${({ theme }) => theme.font.mono};
`;

export const UploadArea = styled.div`
  padding: ${({ theme }) => theme.space[6]};
  background: ${({ theme }) => theme.color.ink[50]};
  border: 1.5px dashed ${({ theme }) => theme.color.border[2]};
  border-radius: ${({ theme }) => theme.radius.md};
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  text-align: center;
`;

export const Footer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: ${({ theme }) => theme.space[5]};
`;

export const FooterMeta = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const FooterActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.space[2]};
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
  display: inline-flex;
  align-items: center;
  gap: 6px;
  &:disabled {
    background: ${({ theme }) => theme.color.ink[300]};
    cursor: not-allowed;
  }
`;
