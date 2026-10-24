import type { JSX } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '../Button';
import { DialogBackdrop } from '../DialogPrimitives';
import { Icon } from '../Icon';
import { MWBottomSheet } from '../MWBottomSheet';
import type { SessionExpiredDialogProps } from './SessionExpiredDialog.types';
import {
  Card,
  CardBody,
  CardFoot,
  Heading,
  LockIcon,
  Meta,
  SheetBody,
  SheetStack,
} from './SessionExpiredDialog.styles';

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

  const lockIcon = (
    <LockIcon aria-hidden>
      <Icon icon={Lock} size={24} />
    </LockIcon>
  );

  if (mobile) {
    return (
      <MWBottomSheet open onClose={noop} labelledBy={TITLE_ID}>
        <SheetBody>
          <SheetStack>
            {lockIcon}
            <Heading id={TITLE_ID}>{TITLE}</Heading>
            <Meta>{BODY}</Meta>
          </SheetStack>
          <Button variant="primary" size="lg" fullWidth onClick={onSignIn} data-autofocus>
            Sign in again
          </Button>
        </SheetBody>
      </MWBottomSheet>
    );
  }

  return (
    <DialogBackdrop role="presentation">
      <Card role="alertdialog" aria-modal="true" aria-labelledby={TITLE_ID}>
        <CardBody>
          {lockIcon}
          <Heading id={TITLE_ID}>{TITLE}</Heading>
          <Meta>{BODY}</Meta>
        </CardBody>
        <CardFoot>
          <Button variant="primary" onClick={onSignIn} autoFocus>
            Sign in again
          </Button>
        </CardFoot>
      </Card>
    </DialogBackdrop>
  );
}

function noop(): void {
  /* not dismissable */
}
