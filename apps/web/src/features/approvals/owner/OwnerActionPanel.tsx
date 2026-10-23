import type { ApprovalApproveBody, ApprovalDetail } from 'shared';
import { Button } from '@/components/Button';
import { AccountDeleteConfirm } from './AccountDeleteConfirm';
import { Row, Stack, Warning } from './OwnerAction.styles';
import { OWNER_ACTION_WARNINGS, signerFacts } from './ownerActionModel';
import { SignAsSignerConsent } from './SignAsSignerConsent';

export interface OwnerActionPanelProps {
  readonly detail: ApprovalDetail;
  readonly busy: 'approve' | 'deny' | null;
  readonly onApprove: (body?: ApprovalApproveBody) => void;
  readonly onDeny: () => void;
}

/**
 * The pending approval of a WP-45 owner action (account, keys, the
 * approval setting, a webhook secret, signing as yourself). The card
 * above lists the facts; this adds the kind's warning and its own
 * Approve: the typed email for deletion, the signer's consent and
 * signature for signing. Deny never needs anything.
 */
export function OwnerActionPanel({ detail, busy, onApprove, onDeny }: OwnerActionPanelProps) {
  if (detail.kind === 'account_delete') {
    return (
      <AccountDeleteConfirm
        accountEmail={detail.summary.approver_email}
        busy={busy}
        onApprove={(confirm_email) => {
          onApprove({ confirm_email });
        }}
        onDeny={onDeny}
      />
    );
  }
  if (detail.kind === 'envelope_sign_as_signer') {
    return (
      <SignAsSignerConsent
        signer={signerFacts(detail.summary)}
        busy={busy}
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );
  }
  const warning = OWNER_ACTION_WARNINGS[detail.kind];
  const destructive = detail.kind === 'api_key_revoke' || detail.kind === 'oauth_grant_revoke';
  return (
    <Stack>
      {warning ? <Warning role="note">{warning}</Warning> : null}
      <Row>
        <Button
          size="lg"
          variant={destructive ? 'danger' : 'primary'}
          loading={busy === 'approve'}
          disabled={busy === 'deny'}
          onClick={() => {
            onApprove();
          }}
        >
          Approve
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
