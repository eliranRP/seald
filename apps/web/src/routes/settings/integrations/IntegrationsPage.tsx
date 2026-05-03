import { useCallback, useState } from 'react';
import {
  Link as LinkIcon,
  ChevronRight,
  Eye,
  Lock,
  XCircle,
  Cloud,
  AlertTriangle,
} from 'lucide-react';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import type { ApiError } from '@/lib/api/apiClient';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Icon } from '@/components/Icon';
import {
  useGDriveAccounts,
  useConnectGDrive,
  useDisconnectGDrive,
  type GDriveAccount,
} from './useGDriveAccounts';
import { DisconnectModal } from './DisconnectModal';

// ─────────────────────────────────────────────────────────────────────
// Layout
// ─────────────────────────────────────────────────────────────────────

const Page = styled.div`
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 32px 80px;
`;

const BreadcrumbNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const BreadcrumbCurrent = styled.span`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Hero = styled.header`
  margin: 14px 0 28px;
`;

const Title = styled.h1`
  margin: 0;
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
  letter-spacing: ${({ theme }) => theme.font.tracking.tight};
  line-height: ${({ theme }) => theme.font.lineHeight.tight};
`;

const Subtitle = styled.p`
  margin: 8px 0 0;
  font-size: ${({ theme }) => theme.font.size.body};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.relaxed};
  max-width: 640px;
`;

const CardStack = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[4]};
`;

const CardHeader = styled.div`
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

const CardBody = styled.div`
  padding: 20px 24px;
`;

const CardTitle = styled.div`
  font-size: 16px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const CardSubtitle = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

const CardHeaderText = styled.div`
  flex: 1;
  min-width: 0;
`;

const EmptyGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 32px;
  align-items: flex-start;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const EmptyCopy = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: 14px;
`;

const ConnectHint = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[4]};
  margin-top: 10px;
`;

const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: 12px;
`;

const PermissionUl = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const PermissionLi = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const PermissionIconWrap = styled.span`
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[3]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const AccountRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const AccountMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const AccountEmail = styled.div`
  font-size: 14px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const AccountSub = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

const MultiAccountRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: 14px;
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[4]};
`;

const ComingSoonChip = styled.span`
  margin-left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: 10px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wide};
  text-transform: uppercase;
`;

const ComingSoonHeader = styled.div`
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  opacity: 0.65;
`;

const ConfigAlert = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 16px;
  padding: 14px 16px;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const ConfigAlertIconWrap = styled.span`
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ConfigAlertCopy = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const ConfigAlertTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  margin-bottom: 2px;
`;

const ComingSoonIconWrap = styled.div`
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: ${({ theme }) => theme.color.ink[100]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.color.fg[3]};
  flex-shrink: 0;
`;

// ─────────────────────────────────────────────────────────────────────
// Local helpers
// ─────────────────────────────────────────────────────────────────────

function GDriveLogo({ size = 32 }: { readonly size?: number }) {
  // Inline tri-color Drive mark — avoids pulling a brand asset / icon dep
  // and matches the design-guide reference at
  // Design-Guide/project/gdrive-integration/Integrations.jsx.
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      role="img"
      aria-label="Google Drive"
      style={{ flexShrink: 0 }}
    >
      <title>Google Drive</title>
      <path d="M11 4 L21 4 L31 21 L26 30 L16 13 Z" fill="#FBBC04" />
      <path d="M11 4 L1 21 L6 30 L16 13 Z" fill="#1FA463" />
      <path d="M6 30 L26 30 L31 21 L11 21 Z" fill="#4285F4" />
    </svg>
  );
}

const PERMISSIONS = [
  { icon: Eye, text: 'Read only the files you pick — never your full Drive.' },
  { icon: Lock, text: 'Tokens are encrypted at rest with KMS envelope encryption.' },
  { icon: XCircle, text: 'Revoke access any time — disconnecting deletes the tokens.' },
] as const;

function PermissionList() {
  return (
    <PermissionUl>
      {PERMISSIONS.map((p) => (
        <PermissionLi key={p.text}>
          <PermissionIconWrap>
            <Icon icon={p.icon} size={13} />
          </PermissionIconWrap>
          <span style={{ paddingTop: 3 }}>{p.text}</span>
        </PermissionLi>
      ))}
    </PermissionUl>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface ComingSoonCardProps {
  readonly name: string;
  readonly description: string;
}

function ComingSoonCard({ name, description }: ComingSoonCardProps) {
  return (
    <Card padding={1} style={{ overflow: 'hidden', padding: 0 }}>
      <ComingSoonHeader>
        <ComingSoonIconWrap aria-hidden>
          <Cloud width={18} height={18} strokeWidth={1.75} />
        </ComingSoonIconWrap>
        <CardHeaderText>
          <CardTitle>{name}</CardTitle>
          <CardSubtitle>{description}</CardSubtitle>
        </CardHeaderText>
        <Badge tone="neutral">Coming soon</Badge>
      </ComingSoonHeader>
    </Card>
  );
}

interface GDriveCardProps {
  readonly accounts: ReadonlyArray<GDriveAccount>;
  readonly onConnect: () => void;
  readonly onDisconnect: (account: GDriveAccount) => void;
  readonly connecting: boolean;
}

function GDriveCard({ accounts, onConnect, onDisconnect, connecting }: GDriveCardProps) {
  const isConnected = accounts.length > 0;
  const showMultiAccount = isFeatureEnabled('gdriveMultiAccount');
  return (
    <Card padding={1} style={{ overflow: 'hidden', padding: 0 }}>
      <CardHeader>
        <GDriveLogo size={32} />
        <CardHeaderText>
          <CardTitle>Google Drive</CardTitle>
          <CardSubtitle>
            Pick PDFs and Google Docs from Drive when starting a new document or applying a
            template.
          </CardSubtitle>
        </CardHeaderText>
        {isConnected ? <Badge tone="emerald">Connected</Badge> : null}
      </CardHeader>
      <CardBody>
        {isConnected ? (
          <>
            {accounts.map((account) => (
              <AccountRow key={account.id}>
                <Avatar name={account.email} size={40} />
                <AccountMeta>
                  <AccountEmail>{account.email}</AccountEmail>
                  <AccountSub>
                    Connected {formatDate(account.connectedAt)} · Last used{' '}
                    {formatDate(account.lastUsedAt)}
                  </AccountSub>
                </AccountMeta>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => onDisconnect(account)}
                  aria-label={`Disconnect ${account.email}`}
                >
                  Disconnect
                </Button>
              </AccountRow>
            ))}
            {showMultiAccount ? (
              <MultiAccountRow>
                <Button variant="ghost" size="sm" iconLeft={LinkIcon} onClick={onConnect}>
                  Add another account
                </Button>
              </MultiAccountRow>
            ) : (
              <MultiAccountRow aria-hidden>
                <span>+ Add another account</span>
                <ComingSoonChip>Coming soon</ComingSoonChip>
              </MultiAccountRow>
            )}
          </>
        ) : (
          <EmptyGrid>
            <div>
              <EmptyCopy>No accounts connected.</EmptyCopy>
              <Button
                variant="primary"
                iconLeft={LinkIcon}
                onClick={onConnect}
                loading={connecting}
                disabled={connecting}
              >
                Connect Google Drive
              </Button>
              <ConnectHint>
                Opens Google&apos;s sign-in window. You&apos;ll choose what to share.
              </ConnectHint>
            </div>
            <div>
              <Eyebrow>What we ask for</Eyebrow>
              <PermissionList />
            </div>
          </EmptyGrid>
        )}
      </CardBody>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────

/**
 * L4 page — `/settings/integrations`. Standalone surface (no left rail
 * — Phase 3 watchpoint #5): a `<Breadcrumb>` carries the user back to a
 * future Settings index, and the Integrations index itself is just a
 * stack of provider cards (Drive, then two coming-soon stubs).
 *
 * The mobile-redirect rule lives in `AppShell` — every route mounted
 * under it bounces to `/m/send` on viewports ≤ 640 px. A regression
 * test in `mobile-redirect.test.tsx` pins that contract for this route.
 *
 * The page is rendered behind `feature.gdriveIntegration` at the
 * router level — when the flag is OFF, the API also 404s every
 * `/integrations/gdrive/*` route, so the empty-state CTA cannot reach
 * a working backend. The hook maps the 404 to an empty list so this
 * page still renders cleanly in dev when the flag is off.
 */
export function IntegrationsPage() {
  const accountsQuery = useGDriveAccounts();
  const connect = useConnectGDrive();
  const disconnect = useDisconnectGDrive();

  const [pendingDisconnect, setPendingDisconnect] = useState<GDriveAccount | null>(null);

  const handleConnect = useCallback((): void => {
    connect.mutate();
  }, [connect]);

  const openDisconnect = useCallback((account: GDriveAccount): void => {
    setPendingDisconnect(account);
  }, []);

  const closeDisconnect = useCallback((): void => {
    setPendingDisconnect(null);
  }, []);

  const confirmDisconnect = useCallback((): void => {
    if (!pendingDisconnect) return;
    disconnect.mutate(pendingDisconnect.id, {
      onSuccess: () => setPendingDisconnect(null),
    });
  }, [disconnect, pendingDisconnect]);

  const accounts = accountsQuery.data ?? [];

  return (
    <Page>
      <BreadcrumbNav aria-label="Breadcrumb">
        <span>Settings</span>
        <Icon icon={ChevronRight} size={12} />
        <BreadcrumbCurrent aria-current="page">Integrations</BreadcrumbCurrent>
      </BreadcrumbNav>

      <Hero>
        <Title>Integrations</Title>
        <Subtitle>
          Connect external services to import documents into Seald. We only ever read files you
          explicitly pick.
        </Subtitle>
      </Hero>

      {(connect.error as ApiError | null)?.status === 503 ? (
        <ConfigAlert role="alert">
          <ConfigAlertIconWrap aria-hidden>
            <Icon icon={AlertTriangle} size={16} />
          </ConfigAlertIconWrap>
          <ConfigAlertCopy>
            <ConfigAlertTitle>Drive integration is not configured on this server</ConfigAlertTitle>
            The server is missing its Google OAuth credentials. Ask your admin to set
            <code style={{ margin: '0 4px' }}>GDRIVE_OAUTH_CLIENT_ID</code>
            and
            <code style={{ margin: '0 4px' }}>GDRIVE_OAUTH_CLIENT_SECRET</code>
            before connecting an account.
          </ConfigAlertCopy>
        </ConfigAlert>
      ) : null}

      <CardStack>
        <GDriveCard
          accounts={accounts}
          onConnect={handleConnect}
          onDisconnect={openDisconnect}
          connecting={connect.isPending}
        />
        <ComingSoonCard
          name="Dropbox"
          description="Pick documents from Dropbox folders and shared drives."
        />
        <ComingSoonCard
          name="OneDrive"
          description="Import documents from Microsoft 365 OneDrive."
        />
      </CardStack>

      <DisconnectModal
        open={pendingDisconnect !== null}
        accountEmail={pendingDisconnect?.email ?? ''}
        pending={disconnect.isPending}
        onClose={closeDisconnect}
        onConfirm={confirmDisconnect}
      />
    </Page>
  );
}
