import type { JSX } from 'react';
import { Button } from '../Button';
import { DialogBackdrop, DialogCard, DialogFooter, DialogTitle } from '../DialogPrimitives';
import { MWBottomSheet } from '../MWBottomSheet';
import type { SessionExpiredDialogProps } from './SessionExpiredDialog.types';
import { Meta, SheetBody, SheetHeading } from './SessionExpiredDialog.styles';

const TITLE = 'You were signed out';
const BODY = 'Sign in to keep going.';
const TITLE_ID = 'session-expired-title';

/**
 * L3 widget — "You were signed out" (design System.dc, `session`). A modal
 * on desktop and a bottom sheet on phones; the page stays mounted behind it.
 * It cannot be dismissed: the only way out is "Sign in again", which the host
 * wires to a local sign-out plus `/signin?next=<current page>`.
 */
export function SessionExpiredDialog(props: SessionExpiredDialogProps): JSX.Element | null {
  const { open, onSignIn, mobile = false } = props;
  if (!open) return null;

  if (mobile) {
    return (
      <MWBottomSheet open onClose={noop} labelledBy={TITLE_ID}>
        <SheetBody>
          <SheetHeading id={TITLE_ID}>{TITLE}</SheetHeading>
          <Meta>{BODY}</Meta>
          <Button variant="primary" size="lg" fullWidth onClick={onSignIn} data-autofocus>
            Sign in again
          </Button>
        </SheetBody>
      </MWBottomSheet>
    );
  }

  return (
    <DialogBackdrop role="presentation">
      <DialogCard role="alertdialog" aria-modal="true" aria-labelledby={TITLE_ID}>
        <DialogTitle id={TITLE_ID}>{TITLE}</DialogTitle>
        <Meta>{BODY}</Meta>
        <DialogFooter>
          <Button variant="primary" onClick={onSignIn} autoFocus>
            Sign in again
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}

function noop(): void {
  /* not dismissable */
}
