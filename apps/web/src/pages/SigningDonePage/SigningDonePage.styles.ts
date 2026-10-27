import styled from 'styled-components';
import { Fine } from '@/features/signing/ui/StatusPage';

/**
 * Download and "Save a copy": in the status column on desktop; a full-width
 * stack 8px apart on mobile (canvas Sign-M-done `.btn-block`). The extra top
 * margin parts the actions from the status lines above (32px vs 16px).
 */
export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  margin-top: ${({ theme }) => theme.space[4]};

  @media (max-width: 640px) {
    align-self: stretch;
    align-items: stretch;
    gap: ${({ theme }) => theme.space[2]};

    & > a:last-child {
      min-height: 44px;
    }
  }
`;

export const Hint = styled.p<{ readonly $error?: boolean }>`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.xs};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
  color: ${({ theme, $error }) => ($error ? theme.color.danger[700] : theme.color.fg[3])};
`;

/** Retention notice and signature level: a third group, set apart like the actions. */
export const FinePrint = styled(Fine)`
  margin-top: ${({ theme }) => theme.space[4]};
`;
