import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ScanSearch } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { Button } from '@/components/Button';
import { ApprovalReview } from '@/features/approvals/review/ApprovalReview';
import { useSendEnvelopeMutation, type Envelope } from '@/features/envelopes';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { ApiError } from '@/lib/api/apiClient';
import { Overlay } from './ReviewPlacement.styles';

export interface ReviewPlacementProps {
  readonly envelope: Envelope;
  /** Called once the send went through, after the review closed. */
  readonly onSent?: (() => void) | undefined;
}

/** Why a send was refused, in words the owner can act on. */
function problemFor(err: Error): string {
  const code = (err as ApiError).code;
  if (code === 'signer_without_signature_field') {
    return 'Every signer needs a signature field. Choose Edit to add one.';
  }
  if (code === 'no_signers' || code === 'no_fields' || code === 'file_required') {
    return "This draft isn't ready to send yet. Check the file, the signers and the fields.";
  }
  return 'That did not go through. Please try again.';
}

/**
 * One-tap "Review placement" in the app (docs/design/mcp-server.md, Later):
 * the guided review of step 7d, on the owner's own draft, with no MCP
 * approval involved. It walks every page in each signer's colour. "Send"
 * sends the draft as it is; "Edit" opens the field editor. Shown for a
 * draft that has a file, a signer and fields, with the MCP server on, which
 * is when an agent may have placed them.
 */
export function ReviewPlacement({ envelope, onSent }: ReviewPlacementProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobileViewport();
  const send = useSendEnvelopeMutation();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [problem, setProblem] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Focus moves into the review when it opens and back to the button when
  // it closes (not on first render, when it was never open).
  useEffect(() => {
    if (open) {
      layer.current?.focus();
      wasOpen.current = true;
    } else if (wasOpen.current) {
      trigger.current?.focus({ preventScroll: true });
      wasOpen.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const reviewable =
    isFeatureEnabled('mcpServer') &&
    envelope.status === 'draft' &&
    envelope.original_pages !== null &&
    envelope.signers.length > 0 &&
    envelope.fields.length > 0;
  if (!reviewable) return null;

  const close = (): void => {
    setOpen(false);
    setProblem(null);
  };

  const approve = (): void => {
    setProblem(null);
    send.mutate(envelope.id, {
      onSuccess: () => {
        close();
        onSent?.();
      },
      onError: (err) => {
        setProblem(problemFor(err));
      },
    });
  };

  return (
    <>
      <Button
        ref={trigger}
        variant="secondary"
        iconLeft={ScanSearch}
        onClick={() => {
          setStep(1);
          setOpen(true);
        }}
      >
        Review placement
      </Button>
      {open
        ? createPortal(
            <Overlay
              ref={layer}
              role="dialog"
              aria-modal="true"
              aria-label="Review placement"
              tabIndex={-1}
            >
              <ApprovalReview
                envelope={envelope}
                actionLabel="Send for signature"
                step={step}
                onStepChange={setStep}
                onApprove={approve}
                onEdit={
                  isMobile
                    ? undefined
                    : () => {
                        close();
                        navigate(`/document/${envelope.id}`);
                      }
                }
                onExit={close}
                busy={send.isPending}
                notice={problem}
                isMobile={isMobile}
                approveLabel="Send"
                backLabel="Close the review"
              />
            </Overlay>,
            document.body,
          )
        : null}
    </>
  );
}
