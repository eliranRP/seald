import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useAccountActions } from '@/features/account';
import { useAuth } from '@/providers/AuthProvider';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
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

  const leave = useCallback(async (): Promise<void> => {
    await signOut().catch(() => undefined);
    navigate('/signin', { replace: true });
  }, [signOut, navigate]);

  const account = useAccountActions({ onAccountDeleted: leave });

  return (
    <Section aria-label="Account">
      <RowsCard>
        <Row>
          <RowIcon>
            <Icon icon={Download} size={14} />
          </RowIcon>
          <RowLabel>Download my data</RowLabel>
          <Spacer />
          <Button
            variant="secondary"
            size="sm"
            loading={account.isExporting}
            onClick={() => void account.exportData()}
          >
            {account.isExporting ? 'Preparing…' : 'Download'}
          </Button>
        </Row>
        <Row $last>
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

      <Eyebrow $danger>Danger zone</Eyebrow>
      <RowsCard>
        <Row $last>
          <RowIcon $danger>
            <Icon icon={Trash2} size={14} />
          </RowIcon>
          <RowLabel $danger>Delete account</RowLabel>
          <Spacer />
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            Delete
          </Button>
        </Row>
      </RowsCard>

      {confirming ? (
        <DeleteAccountDialog
          open
          deleting={account.isDeleting}
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            void account.deleteAccount().finally(() => setConfirming(false));
          }}
        />
      ) : null}
    </Section>
  );
}
