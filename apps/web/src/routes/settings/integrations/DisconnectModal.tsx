import { forwardRef, useEffect, useId } from 'react';
import { Unlink } from 'lucide-react';
import styled from 'styled-components';
import { Button } from '@/components/Button';

export interface DisconnectModalProps {
  readonly open: boolean;
  readonly accountEmail: string;
  readonly pending?: boolean | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  z-index: ${({ theme }) => theme.z.modal};
  display: flex;
  align-items: center;
  justify-content: center;
  padding: ${({ theme }) => theme.space[5]};
`;

const Card = styled.div`
  width: 100%;
  max-width: 480px;
  background: ${({ theme }) => theme.color.bg.surface};
  border-radius: ${({ theme }) => theme.radius.xl};
  box-shadow: ${({ theme }) => theme.shadow.xl};
  padding: 28px 28px 22px;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const Header = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
`;

const IconBubble = styled.div`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const TitleBlock = styled.div`
  flex: 1;
  min-width: 0;
`;

const Title = styled.h2`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: 22px;
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: -0.01em;
  line-height: 1.2;
`;

const Description = styled.p`
  margin: 4px 0 0;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const AccountChip = styled.div`
  padding: 12px 14px;
  background: ${({ theme }) => theme.color.bg.sunken};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  font-size: 13px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.space[2]};
`;

/**
 * Destructive-confirm modal for disconnecting a Google Drive account.
 * Mirrors the design at Design-Guide/project/gdrive-integration/Integrations.jsx
 * (the `DisconnectModal` block). Standalone of any settings layout — a
 * thin overlay rendered by IntegrationsPage when the user clicks the
 * row's Disconnect button.
 *
 * Accessibility: `role="alertdialog"` because the action is destructive
 * and irrevocable; Esc closes; backdrop click closes; both buttons are
 * disabled while a pending mutation is in flight so the user can't
 * double-fire the delete.
 */
export const DisconnectModal = forwardRef<HTMLDivElement, DisconnectModalProps>((props, ref) => {
  const { open, accountEmail, pending, onClose, onConfirm } = props;
  const titleId = useId();
  const descId = useId();

  // Esc closes — single-purpose effect (rule 4.4).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Backdrop role="presentation" onClick={onClose}>
      <Card
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        <Header>
          <IconBubble aria-hidden>
            <Unlink width={20} height={20} strokeWidth={1.75} />
          </IconBubble>
          <TitleBlock>
            <Title id={titleId}>Disconnect Google Drive?</Title>
            <Description id={descId}>
              Documents you&apos;ve already imported will keep working. You won&apos;t be able to
              pick new files until you reconnect.
            </Description>
          </TitleBlock>
        </Header>

        <AccountChip>{accountEmail}</AccountChip>

        <Footer>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button
            variant="danger"
            iconLeft={Unlink}
            onClick={onConfirm}
            disabled={pending}
            loading={pending}
            autoFocus
          >
            Disconnect
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );
});

DisconnectModal.displayName = 'DisconnectModal';
