import { useCallback, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import {
  Link as LinkIcon,
  ChevronRight,
  Eye,
  Lock,
  X,
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
import { readIsMobileViewport } from '@/hooks/useIsMobileViewport';
import {
  useGDriveAccounts,
  useConnectGDrive,
  useDisconnectGDrive,
  useReconnectGDrive,
  useGDriveOAuthCallbackBridge,
  useGDriveOAuthMessageListener,
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
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[8]} ${theme.space[20]}`};
`;

const BreadcrumbNav = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const BreadcrumbLink = styled(Link)`
  color: ${({ theme }) => theme.color.fg[3]};
  text-decoration: none;
  border-radius: ${({ theme }) => theme.radius.xs};

  &:hover {
    color: ${({ theme }) => theme.color.fg[1]};
    text-decoration: underline;
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

const BreadcrumbCurrent = styled.span`
  color: ${({ theme }) => theme.color.fg[1]};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
`;

const Hero = styled.header`
  margin: ${({ theme }) => `${theme.space[4]} 0 ${theme.space[8]}`};
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
  margin: ${({ theme }) => `${theme.space[2]} 0 0`};
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
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

const CardBody = styled.div`
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
`;

/**
 * Visual card title. Rendered as `<h2>` so screen readers pick it up as
 * a landmark (audit slice C #7 — LOW). Styled identically to the prior
 * `<div>` so the visual treatment is unchanged.
 */
const CardTitle = styled.h2`
  margin: 0;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const CardSubtitle = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

const CardHeaderText = styled.div`
  flex: 1;
  min-width: 0;
`;

/**
 * Empty-state grid. Audit slice C #5 (MEDIUM):
 *  - Breakpoint bumped 720 → 880 px so the "What we ask for" column
 *    doesn't get cramped at 720–960 px.
 *  - Gap → `theme.space[8]`.
 *  - At narrow widths the permissions block is placed ABOVE the CTA
 *    via grid-template-areas: the permissions column moves to row 1 and
 *    the CTA stack drops to row 2. This is purely a DOM/order change
 *    (no flex-direction: column-reverse hack) so a11y/reading order
 *    stays consistent for screen readers at every width.
 */
const EmptyGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 280px;
  grid-template-areas: 'cta perms';
  gap: ${({ theme }) => theme.space[8]};
  align-items: flex-start;

  @media (max-width: 880px) {
    grid-template-columns: 1fr;
    grid-template-areas:
      'perms'
      'cta';
  }
`;

const EmptyGridCta = styled.div`
  grid-area: cta;
`;

const EmptyGridPerms = styled.div`
  grid-area: perms;
`;

const EmptyCopy = styled.div`
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: ${({ theme }) => theme.space[4]};
`;

const ConnectHint = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[4]};
  margin-top: ${({ theme }) => theme.space[2]};
`;

const Eyebrow = styled.div`
  font-family: ${({ theme }) => theme.font.sans};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wider};
  text-transform: uppercase;
  color: ${({ theme }) => theme.color.fg[3]};
  margin-bottom: ${({ theme }) => theme.space[3]};
`;

const PermissionUl = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

const PermissionLi = styled.li`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const PermissionIconWrap = styled.span`
  width: 24px;
  height: 24px;
  border-radius: ${({ theme }) => theme.radius.sm};
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
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const AccountMeta = styled.div`
  flex: 1;
  min-width: 0;
`;

const AccountEmail = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const AccountActions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
`;

const AccountSub = styled.div`
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[3]};
  margin-top: 2px;
`;

const MultiAccountRow = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  margin-top: ${({ theme }) => theme.space[4]};
  font-size: ${({ theme }) => theme.font.size.micro};
  color: ${({ theme }) => theme.color.fg[4]};
`;

const ComingSoonChip = styled.span`
  margin-left: ${({ theme }) => theme.space[1]};
  padding: ${({ theme }) => `2px ${theme.space[2]}`};
  border-radius: ${({ theme }) => theme.radius.pill};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.micro};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  letter-spacing: ${({ theme }) => theme.font.tracking.wide};
  text-transform: uppercase;
`;

const ComingSoonHeader = styled.div`
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[6]}`};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  opacity: 0.65;
`;

const ConfigAlert = styled.div`
  display: flex;
  align-items: flex-start;
  gap: ${({ theme }) => theme.space[3]};
  margin-bottom: ${({ theme }) => theme.space[4]};
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
`;

const ConfigAlertIconWrap = styled.span`
  width: 28px;
  height: 28px;
  border-radius: ${({ theme }) => theme.radius.sm};
  background: ${({ theme }) => theme.color.ink[100]};
  color: ${({ theme }) => theme.color.fg[2]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const ConfigAlertCopy = styled.div`
  flex: 1;
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[2]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

const ConfigAlertDismiss = styled.button`
  border: 0;
  background: transparent;
  padding: ${({ theme }) => theme.space[1]};
  border-radius: ${({ theme }) => theme.radius.sm};
  color: ${({ theme }) => theme.color.fg[3]};
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &:hover {
    background: ${({ theme }) => theme.color.ink[100]};
    color: ${({ theme }) => theme.color.fg[1]};
  }

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

const ConfigAlertTitle = styled.div`
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
  margin-bottom: 2px;
`;

const ComingSoonIconWrap = styled.div`
  width: 32px;
  height: 32px;
  border-radius: ${({ theme }) => theme.radius.sm};
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

const PermissionText = styled.span`
  padding-top: 3px;
`;

function PermissionList() {
  return (
    <PermissionUl>
      {PERMISSIONS.map((p) => (
        <PermissionLi key={p.text}>
          <PermissionIconWrap>
            <Icon icon={p.icon} size={13} />
          </PermissionIconWrap>
          <PermissionText>{p.text}</PermissionText>
        </PermissionLi>
      ))}
    </PermissionUl>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
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
  readonly onReconnect: () => void;
  readonly onDisconnect: (account: GDriveAccount) => void;
  readonly connecting: boolean;
  readonly reconnecting: boolean;
}

/**
 * Health summary shown next to the card title. If any connected
 * account's token is in `reconnect_required`, the whole card surfaces a
 * warning badge — at the row level we surface a per-email badge too so
 * multi-account installs (`gdriveMultiAccount` feature flag) make it
 * obvious which account needs attention. Audit slice C #4 (HIGH).
 */
function deriveCardBadge(accounts: ReadonlyArray<GDriveAccount>): {
  readonly tone: 'emerald' | 'amber';
  readonly label: string;
} | null {
  if (accounts.length === 0) return null;
  const anyExpired = accounts.some((a) => a.tokenStatus === 'reconnect_required');
  if (anyExpired) return { tone: 'amber', label: 'Reconnect required' };
  return { tone: 'emerald', label: 'Connected' };
}

function GDriveCard({
  accounts,
  onConnect,
  onReconnect,
  onDisconnect,
  connecting,
  reconnecting,
}: GDriveCardProps) {
  const isConnected = accounts.length > 0;
  const showMultiAccount = isFeatureEnabled('gdriveMultiAccount');
  const cardBadge = deriveCardBadge(accounts);
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
        {cardBadge ? <Badge tone={cardBadge.tone}>{cardBadge.label}</Badge> : null}
      </CardHeader>
      <CardBody>
        {isConnected ? (
          <>
            {accounts.map((account) => {
              const needsReconnect = account.tokenStatus === 'reconnect_required';
              return (
                <AccountRow key={account.id}>
                  <Avatar name={account.email} size={40} />
                  <AccountMeta>
                    <AccountEmail>
                      {account.email}
                      {needsReconnect ? <Badge tone="amber">Reconnect required</Badge> : null}
                    </AccountEmail>
                    <AccountSub>
                      Connected {formatDate(account.connectedAt)} · Last used{' '}
                      {formatDate(account.lastUsedAt)}
                    </AccountSub>
                  </AccountMeta>
                  <AccountActions>
                    {needsReconnect ? (
                      <>
                        <Button
                          variant="primary"
                          size="sm"
                          iconLeft={LinkIcon}
                          onClick={onReconnect}
                          loading={reconnecting}
                          disabled={reconnecting}
                          aria-label={`Reconnect ${account.email}`}
                        >
                          Reconnect
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDisconnect(account)}
                          aria-label={`Disconnect ${account.email}`}
                        >
                          Disconnect
                        </Button>
                      </>
                    ) : (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => onDisconnect(account)}
                        aria-label={`Disconnect ${account.email}`}
                      >
                        Disconnect
                      </Button>
                    )}
                  </AccountActions>
                </AccountRow>
              );
            })}
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
            <EmptyGridPerms>
              <Eyebrow>What we ask for</Eyebrow>
              <PermissionList />
            </EmptyGridPerms>
            <EmptyGridCta>
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
            </EmptyGridCta>
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
 * — Phase 3 watchpoint #5): a `<Breadcrumb>` carries the user back to
 * the Settings index, and the Integrations index itself is just a stack
 * of provider cards (Drive, then two coming-soon stubs).
 *
 * The mobile-redirect rule lives in `AppShell` — every route mounted
 * under it bounces to `/m/send` on viewports ≤ 640 px. As a defence-
 * in-depth fix for audit slice C #1 (HIGH) — the deployed mobile build
 * was observed surfacing the ErrorBoundary fallback BEFORE AppShell's
 * guard fired — the wrapper component below also short-circuits the
 * hook chain via `readIsMobileViewport()` so any future hook-chain
 * regression in `IntegrationsPageInner` cannot crash on a 390 px
 * viewport. Pinned by `mobile-render.test.tsx`.
 *
 * The page is rendered behind `feature.gdriveIntegration` at the
 * router level — when the flag is OFF, the API also 404s every
 * `/integrations/gdrive/*` route, so the empty-state CTA cannot reach
 * a working backend. The hook maps the 404 to an empty list so this
 * page still renders cleanly in dev when the flag is off.
 */
export function IntegrationsPage() {
  if (readIsMobileViewport()) {
    return <Navigate to="/m/send" replace />;
  }
  return <IntegrationsPageInner />;
}

function IntegrationsPageInner() {
  const [searchParams] = useSearchParams();
  const isCallbackReturn = searchParams.has('connected');

  // Bug F (Phase 6.A iter-2 PROD, 2026-05-04). The OAuth-callback popup
  // lands here with `?connected=1`. Bridge it back to the opener +
  // close the popup; in same-tab fallback (popup blocker), refresh
  // accounts inline.
  //
  // The companion listener is also mounted at `AppShell` (so any authed
  // surface — UploadRoute, UseTemplatePage, etc. — flips to "connected"
  // when the popup posts back). Mounting it here too is intentional
  // belt-and-suspenders: it keeps this page testable in isolation
  // (renderPage() doesn't include AppShell), and React Query dedupes
  // concurrent invalidations against the same query key, so the
  // double-mount has no observable cost in production.
  const isOAuthPopupBridge = useGDriveOAuthCallbackBridge(isCallbackReturn);
  useGDriveOAuthMessageListener();

  const accountsQuery = useGDriveAccounts();
  const connect = useConnectGDrive();
  const reconnect = useReconnectGDrive();
  const disconnect = useDisconnectGDrive();

  const [pendingDisconnect, setPendingDisconnect] = useState<GDriveAccount | null>(null);

  const handleConnect = useCallback((): void => {
    connect.mutate();
  }, [connect]);

  const handleReconnect = useCallback((): void => {
    reconnect.mutate();
  }, [reconnect]);

  const dismissConfigAlert = useCallback((): void => {
    // Reset the connect mutation so its `error` clears + the alert
    // unmounts. Phase 6.A iter-2 LOCAL bug — pre-fix the alert had
    // no dismiss control, so once an admin saw the misconfigured
    // state on first click there was no way back to a clean view
    // until they refreshed or attempted a second click.
    connect.reset();
  }, [connect]);

  const openDisconnect = useCallback(
    (account: GDriveAccount): void => {
      // Clear any prior disconnect error from a previous attempt so the
      // newly-opened modal starts clean (the error message belongs to
      // the previous account row, not this one).
      disconnect.reset();
      setPendingDisconnect(account);
    },
    [disconnect],
  );

  const closeDisconnect = useCallback((): void => {
    disconnect.reset();
    setPendingDisconnect(null);
  }, [disconnect]);

  const confirmDisconnect = useCallback((): void => {
    if (!pendingDisconnect) return;
    disconnect.mutate(pendingDisconnect.id, {
      onSuccess: () => setPendingDisconnect(null),
    });
  }, [disconnect, pendingDisconnect]);

  const accounts = accountsQuery.data ?? [];

  // Surface the disconnect mutation error inside the modal so the
  // user can retry or back out — pre-fix the modal sat silent on
  // mutation failure (Phase 6.A iter-2 LOCAL bug).
  const disconnectErrorMessage = disconnect.error
    ? "We couldn't disconnect that account. Please try again."
    : null;

  // Popup-bridge mode: don't render the integrations UI — the bridge
  // effect is firing window.close() this tick. Show a tiny ack so the
  // popup doesn't briefly flash the empty state before closing.
  if (isOAuthPopupBridge) {
    return (
      <Page aria-live="polite">
        <Subtitle>Connection successful — closing this window.</Subtitle>
      </Page>
    );
  }

  return (
    <Page>
      <BreadcrumbNav aria-label="Breadcrumb">
        <BreadcrumbLink to="/settings">Settings</BreadcrumbLink>
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
          <ConfigAlertDismiss
            type="button"
            onClick={dismissConfigAlert}
            aria-label="Dismiss configuration alert"
          >
            <Icon icon={X} size={14} />
          </ConfigAlertDismiss>
        </ConfigAlert>
      ) : null}

      <CardStack>
        <GDriveCard
          accounts={accounts}
          onConnect={handleConnect}
          onReconnect={handleReconnect}
          onDisconnect={openDisconnect}
          connecting={connect.isPending}
          reconnecting={reconnect.isPending}
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
        error={disconnectErrorMessage}
        onClose={closeDisconnect}
        onConfirm={confirmDisconnect}
      />
    </Page>
  );
}
