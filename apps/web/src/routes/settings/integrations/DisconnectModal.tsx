import { forwardRef, useId, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlertTriangle, Unlink } from 'lucide-react';
import styled from 'styled-components';
import { Button } from '@/components/Button';
import { useEscapeKey } from '@/hooks/useEscapeKey';

export interface DisconnectModalProps {
  readonly open: boolean;
  readonly accountEmail: string;
  readonly pending?: boolean | undefined;
  /**
   * Inline error to surface inside the modal — typically the message
   * from a failed disconnect mutation. Shown in a `role="alert"` row
   * above the action buttons; the buttons remain enabled so the user
   * can retry or back out (Phase 6.A iter-2 LOCAL bug — pre-fix the
   * modal sat silent after a failure).
   */
  readonly error?: string | null | undefined;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  /* Audit slice C #6 (MEDIUM): pulled from inline rgba(15,23,42,0.45)
     to the shared theme.color.overlay token (driven by --overlay in
     globalStyles + tokens.css) so every future overlay shares the same
     scrim treatment. */
  background: ${({ theme }) => theme.color.overlay};
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

const ErrorRow = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid ${({ theme }) => theme.color.danger[500]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.danger[50]};
  color: ${({ theme }) => theme.color.danger[700]};
  font-size: 13px;
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
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
  const { open, accountEmail, pending, error, onClose, onConfirm } = props;
  const titleId = useId();
  const descId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);

  useEscapeKey(onClose, open);

  if (!open) return null;

  // Trap Tab inside the alertdialog (rule 4.6 / WCAG 2.1.2).
  // Pre-fix Tab from any focusable inside the modal escaped to the
  // underlying IntegrationsPage Connect button + header links;
  // disorienting and a documented a11y antipattern for destructive
  // confirms.
  const onKeyDownInside = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  // Combine the forwarded ref with the local cardRef so both the
  // caller and our focus-trap query target the same node.
  const setRef = (node: HTMLDivElement | null): void => {
    cardRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  };

  // While an error is showing, the mutation has already settled — the
  // buttons must NOT remain disabled or the user has no way to retry
  // or back out. The pending+!error gate keeps double-fire prevention
  // intact while the request is genuinely in flight.
  const buttonsDisabled = Boolean(pending) && !error;

  return (
    <Backdrop role="presentation" onClick={onClose}>
      <Card
        ref={setRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDownInside}
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

        {error ? (
          <ErrorRow role="alert">
            <AlertTriangle width={16} height={16} strokeWidth={1.75} aria-hidden />
            <span>{error}</span>
          </ErrorRow>
        ) : null}

        <Footer>
          <Button variant="ghost" onClick={onClose} disabled={buttonsDisabled}>
            Cancel
          </Button>
          <Button
            variant="danger"
            iconLeft={Unlink}
            onClick={onConfirm}
            disabled={buttonsDisabled}
            loading={pending && !error}
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
