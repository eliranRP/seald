import { useEffect, useState } from 'react';
import type { ApprovalDetail } from 'shared';
import { Button } from '@/components/Button';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { useAccountActions } from '@/features/account';
import { Fine, Stack } from './OwnerAction.styles';

export interface OwnerActionDoneProps {
  readonly detail: ApprovalDetail;
  /** After an approved account deletion: sign out and leave (the account is gone). */
  readonly onAccountDeleted: () => void;
}

/**
 * What a Done WP-45 approval leaves on the page. A minted key or webhook
 * secret (`reveal`, only in the Approve response) shows once in the
 * shared sheet; closing it drops the value. The export downloads here, in
 * the owner's own browser. A deleted account signs out.
 */
export function OwnerActionDone({ detail, onAccountDeleted }: OwnerActionDoneProps) {
  const secret = detail.reveal?.api_key_secret ?? detail.reveal?.automation_secret ?? null;
  const [shown, setShown] = useState<string | null>(secret);
  const { exportData, isExporting } = useAccountActions();
  const deleted = detail.kind === 'account_delete';

  // One job: an approved deletion ends the session (the account is gone).
  useEffect(() => {
    if (deleted) onAccountDeleted();
  }, [deleted, onAccountDeleted]);

  if (deleted) return <Fine role="status">Your account was deleted. Signing you out…</Fine>;

  return (
    <Stack>
      {detail.kind === 'account_export' ? (
        <Button
          size="lg"
          variant="primary"
          loading={isExporting}
          onClick={() => {
            exportData().catch(() => undefined);
          }}
        >
          Download your data
        </Button>
      ) : null}
      {(detail.kind === 'api_key_create' || detail.kind === 'automation_rotate_secret') &&
      shown === null ? (
        <Fine>
          The secret was shown once when you approved. If you did not copy it, revoke it in Settings
          and ask again.
        </Fine>
      ) : null}
      <SecretOnceSheet
        open={shown !== null}
        onClose={() => {
          setShown(null);
        }}
        title={detail.kind === 'api_key_create' ? 'Your new key' : 'Your new signing secret'}
        description="Copy it now. It is shown once."
        secret={shown ?? ''}
      />
    </Stack>
  );
}
