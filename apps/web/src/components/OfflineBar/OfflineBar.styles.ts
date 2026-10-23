import styled from 'styled-components';
import { barDown } from '@/styles/motion';

export const Bar = styled.div<{ $ok: boolean }>`
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 40px;
  padding: 0 ${({ theme }) => theme.space[4]};
  /* Below the status bar on phones that report a safe-area inset. */
  padding-top: env(safe-area-inset-top, 0px);
  box-sizing: content-box;
  background: ${({ theme, $ok }) => ($ok ? theme.color.success[700] : theme.color.fg[1])};
  color: ${({ theme }) => theme.color.fgOnAccent};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  ${barDown}
`;
