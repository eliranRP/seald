import styled from 'styled-components';
import { visuallyHidden } from '@/styles/mixins';

export const Chip = styled.button<{ $ok: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: ${({ theme }) => theme.radius.pill};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.caption};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  background: ${({ theme, $ok }) => ($ok ? theme.color.success[50] : theme.color.warn[50])};
  color: ${({ theme, $ok }) => ($ok ? theme.color.success[700] : theme.color.warn[700])};
  cursor: ${({ $ok }) => ($ok ? 'default' : 'pointer')};

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }

  /* PrepareMobile: icon-only 44px circle. */
  @media (max-width: 640px) {
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
  }
`;

export const Text = styled.span`
  @media (max-width: 640px) {
    ${visuallyHidden}
  }
`;
