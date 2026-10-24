import styled from 'styled-components';
import { Button } from '../Button';

const TABLET = '(max-width: 768px)';

/** Canvas `.state-ico` in indigo: a 72px disc. */
export const StateIcon = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: ${({ theme }) => theme.color.indigo[50]};
  color: ${({ theme }) => theme.color.indigo[700]};
`;

export const Strong = styled.b`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.bold};
  overflow-wrap: anywhere;
`;

/** Mail shortcuts: sized to their label on desktop, two equal halves on a phone. */
export const MailRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 12px;
  width: 100%;

  & > a {
    flex: none;
  }

  @media ${TABLET} {
    & > a {
      flex: 1 1 0;
    }
  }
`;

export const ResendRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
`;

/** Ghost actions: 32px on desktop, 44px touch targets on a phone. */
export const TouchButton = styled(Button)`
  @media ${TABLET} {
    && {
      min-height: 44px;
    }
  }
`;
