import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, Cloud, HardDrive, UserPlus } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import type { ApiError } from '@/lib/api/apiClient';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { GoogleButton } from '@/components/GoogleButton';
import { Icon } from '@/components/Icon';
import { DisconnectModal } from '@/routes/settings/integrations/DisconnectModal';
import {
  useConnectGDrive,
  useDisconnectGDrive,
  useGDriveAccounts,
  useGDriveOAuthCallbackBridge,
  useGDriveOAuthMessageListener,
  useReconnectGDrive,
  type GDriveAccount,
} from '@/routes/settings/integrations/useGDriveAccounts';
import {
  AccountEmail,
  AccountLine,
  CardTitle,
  DangerButton,
  Grow,
  IntegrationCard,
  IntegrationHead,
  IntegrationLogo,
  Meta,
  Row,
  RowIcon,
  RowLabel,
  RowsCard,
  Section,
  Spacer,
} from './SettingsPage.styles';

function formatConnected(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatUsed(iso: string | null, now: number = Date.now()): string {
  if (!iso) return 'not used yet';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'not used yet';
  const minutes = Math.max(0, Math.round((now - then) / 60_000));
  if (minutes < 1) return 'used just now';
  if (minutes < 60) return `used ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `used ${hours}h ago`;
  return `used ${Math.round(hours / 24)}d ago`;
}

function cardMeta(accounts: ReadonlyArray<GDriveAccount>, unavailable: boolean): string {
  if (unavailable) return 'Unavailable';
  if (accounts.length === 0) return 'Not connected';
  if (accounts.some((a) => a.tokenStatus === 'reconnect_required')) return 'Reconnect needed';
  return accounts.length === 1 ? '1 account connected' : `${accounts.length} accounts connected`;
}

/**
 * Integrations: the Google Drive card (not connected, connected, reconnect
 * needed, not configured) and quiet "Soon" rows for the services that are
 * not built yet. Connect, Reconnect and Disconnect use the same hooks as
 * before; the Drive scope is still `drive.file` only.
 */
export function IntegrationsSection() {
  const [searchParams] = useSearchParams();
  const isCallbackReturn = searchParams.has('connected');
  const isPopupBridge = useGDriveOAuthCallbackBridge(isCallbackReturn);
  useGDriveOAuthMessageListener();

  const accountsQuery = useGDriveAccounts();
  const connect = useConnectGDrive();
  const reconnect = useReconnectGDrive();
  const disconnect = useDisconnectGDrive();
  const [pending, setPending] = useState<GDriveAccount | null>(null);

  const accounts = accountsQuery.data ?? [];
  const unavailable = (connect.error as ApiError | null)?.status === 503;
  const multi = isFeatureEnabled('gdriveMultiAccount');

  const openDisconnect = useCallback(
    (account: GDriveAccount): void => {
      disconnect.reset();
      setPending(account);
    },
    [disconnect],
  );
  const closeDisconnect = useCallback((): void => {
    disconnect.reset();
    setPending(null);
  }, [disconnect]);
  const confirmDisconnect = useCallback((): void => {
    if (!pending) return;
    disconnect.mutate(pending.id, { onSuccess: () => setPending(null) });
  }, [disconnect, pending]);

  if (isPopupBridge) {
    return (
      <Section aria-live="polite">
        <Meta>Connection successful — closing this window.</Meta>
      </Section>
    );
  }

  return (
    <Section aria-label="Integrations">
      {unavailable ? (
        <Banner tone="info" icon={AlertTriangle}>
          Drive isn&apos;t set up on this server.
        </Banner>
      ) : null}

      <IntegrationCard>
        <IntegrationHead>
          <IntegrationLogo aria-hidden>
            <Icon icon={HardDrive} size={24} />
          </IntegrationLogo>
          <Grow>
            <CardTitle>Google Drive</CardTitle>
            <Meta>{cardMeta(accounts, unavailable)}</Meta>
          </Grow>
          {accounts.length === 0 ? (
            <GoogleButton
              fullWidth={false}
              label="Connect"
              busy={connect.isPending}
              disabled={unavailable}
              onClick={() => connect.mutate()}
            />
          ) : null}
        </IntegrationHead>

        {accounts.map((account) => {
          const needsReconnect = account.tokenStatus === 'reconnect_required';
          return (
            <AccountLine key={account.id}>
              <Avatar name={account.email} size={40} />
              <Grow>
                <AccountEmail>{account.email}</AccountEmail>
                <Meta>
                  Connected {formatConnected(account.connectedAt)} ·{' '}
                  {formatUsed(account.lastUsedAt)}
                </Meta>
              </Grow>
              {needsReconnect ? (
                <>
                  <Badge tone="amber" icon={Clock}>
                    Reconnect
                  </Badge>
                  <Button
                    variant="primary"
                    size="sm"
                    loading={reconnect.isPending}
                    aria-label={`Reconnect ${account.email}`}
                    onClick={() => reconnect.mutate()}
                  >
                    Reconnect
                  </Button>
                </>
              ) : (
                <DangerButton
                  variant="ghost"
                  size="sm"
                  aria-label={`Disconnect ${account.email}`}
                  onClick={() => openDisconnect(account)}
                >
                  Disconnect
                </DangerButton>
              )}
            </AccountLine>
          );
        })}

        {accounts.length > 0 && multi ? (
          <div>
            <Button
              variant="ghost"
              size="sm"
              iconLeft={UserPlus}
              loading={connect.isPending}
              onClick={() => connect.mutate()}
            >
              Add account
            </Button>
          </div>
        ) : null}
      </IntegrationCard>

      <RowsCard>
        {['Dropbox', 'OneDrive'].map((name, i, all) => (
          <Row key={name} $last={i === all.length - 1}>
            <RowIcon>
              <Icon icon={Cloud} size={14} />
            </RowIcon>
            <RowLabel>{name}</RowLabel>
            <Spacer />
            <Badge tone="neutral">Soon</Badge>
          </Row>
        ))}
      </RowsCard>

      <DisconnectModal
        open={pending !== null}
        accountEmail={pending?.email ?? ''}
        pending={disconnect.isPending}
        error={disconnect.error ? "We couldn't disconnect that account. Please try again." : null}
        onClose={closeDisconnect}
        onConfirm={confirmDisconnect}
      />
    </Section>
  );
}
