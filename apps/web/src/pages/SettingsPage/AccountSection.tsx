import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useAccountActions } from '@/features/account';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Toast } from '@/components/Toast';
import { DeleteAccountDialog } from './DeleteAccountDialog';
import { Eyebrow, Row, RowIcon, RowLabel, RowsCard, Section, Spacer } from './SettingsPage.styles';

/**
 * Account: download everything, sign out, and the danger zone. Delete opens
 * a type-to-confirm dialog; once it succeeds the session is cleared and the
 * user lands on /signin.
 */
export function AccountSection() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  // Export errors toast (until dismissed); delete errors stay in the dialog.
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const leave = useCallback(async (): Promise<void> => {
    await signOut().catch(() => undefined);
    navigate('/signin', { replace: true });
  }, [signOut, navigate]);

  const onError = useCallback(
    (message: string): void => {
      if (confirming) setDeleteError(message);
      else setExportError(message);
    },
    [confirming],
  );

  const account = useAccountActions({ onAccountDeleted: leave, onError });

  return (
    <Section aria-label="Account">
      <RowsCard>
        <Row $min={64} $mobileMin={64}>
          <RowIcon>
            <Icon icon={Download} size={14} />
          </RowIcon>
          <RowLabel>Download my data</RowLabel>
          <Spacer />
          <Button
            variant="secondary"
            size="sm"
            loading={account.isExporting}
            onClick={() => {
              setExportError(null);
              void account.exportData();
            }}
          >
            {account.isExporting ? 'Preparing…' : 'Download'}
          </Button>
        </Row>
        <Row $last $min={64} $mobileMin={64}>
          <RowIcon>
            <Icon icon={LogOut} size={14} />
          </RowIcon>
          <RowLabel>Sign out</RowLabel>
          <Spacer />
          <Button variant="ghost" size="sm" onClick={() => void leave()}>
            Sign out
          </Button>
        </Row>
      </RowsCard>

      <Eyebrow $danger $mobileHidden>
        Danger zone
      </Eyebrow>
      <RowsCard $mobileRule>
        <Row $last $min={64} $mobileMin={64}>
          <RowIcon $danger>
            <Icon icon={Trash2} size={14} />
          </RowIcon>
          <RowLabel $danger>Delete account</RowLabel>
          <Spacer />
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setDeleteError(null);
              setConfirming(true);
            }}
          >
            Delete
          </Button>
        </Row>
      </RowsCard>

      {confirming ? (
        <DeleteAccountDialog
          open
          deleting={account.isDeleting}
          error={deleteError}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            // Success signs out and leaves the page; a failure keeps the
            // dialog open with the reason, so the typed word is not lost.
            setDeleteError(null);
            void account.deleteAccount();
          }}
        />
      ) : null}
      {exportError !== null ? (
        <Toast
          tone="error"
          title="Couldn't prepare your data"
          subtitle={exportError}
          onClose={() => setExportError(null)}
        />
      ) : null}
    </Section>
  );
}
