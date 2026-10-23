import { useState } from 'react';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Row, Stack, Warning } from './OwnerAction.styles';
import { OWNER_ACTION_WARNINGS, emailMatches } from './ownerActionModel';

export interface AccountDeleteConfirmProps {
  /** The account email the owner must type (the card's "Approving as"). */
  readonly accountEmail: string;
  readonly busy: 'approve' | 'deny' | null;
  readonly onApprove: (confirmEmail: string) => void;
  readonly onDeny: () => void;
}

/**
 * `account_delete` (WP-45): the irreversible-deletion warning again, and
 * Approve stays off until the account email is typed by hand. The server
 * checks the typed address too; a mismatch records nothing.
 */
export function AccountDeleteConfirm({
  accountEmail,
  busy,
  onApprove,
  onDeny,
}: AccountDeleteConfirmProps) {
  const [typed, setTyped] = useState('');
  const ready = emailMatches(typed, accountEmail);
  return (
    <Stack>
      <Warning $danger role="note">
        {OWNER_ACTION_WARNINGS.account_delete}
      </Warning>
      <TextField
        label="Type your account email to confirm"
        type="email"
        autoComplete="off"
        value={typed}
        onChange={(v) => {
          setTyped(v);
        }}
        helpText={accountEmail}
      />
      <Row>
        <Button
          size="lg"
          variant="danger"
          loading={busy === 'approve'}
          disabled={!ready || busy === 'deny'}
          onClick={() => {
            onApprove(typed.trim());
          }}
        >
          Delete my account
        </Button>
        <Button
          size="lg"
          variant="secondary"
          loading={busy === 'deny'}
          disabled={busy === 'approve'}
          onClick={onDeny}
        >
          Deny
        </Button>
      </Row>
    </Stack>
  );
}
