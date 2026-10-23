import { useState } from 'react';
import type { ConnectedApp } from 'shared';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { formatShortDate } from '@/lib/dateFormat';
import { useConnectedApps, useRevokeConnectedApp } from './connectedAppsApi';
import { isConnectedAppsEnabled, SCOPE_LABELS } from './model';
import {
  DialogActions,
  Intro,
  KeyListRoot,
  KeyMain,
  KeyMeta,
  KeyName,
  KeyRow,
  KeyText,
  Notice,
  ScopeChip,
  ScopeList,
  Section,
  SectionTitle,
} from './DevelopersPanel.styles';

/**
 * "Connected apps" on the Developers page (docs/design/mcp-server.md
 * § Settings UI, item 8): apps the owner approved through OAuth. Empty
 * until a grant exists. Revoke asks once, focus on Cancel, and the app
 * stops at once. Renders nothing while OAuth is dark (flag off or the API
 * answers 404).
 */
export function ConnectedApps() {
  const enabled = isConnectedAppsEnabled();
  const apps = useConnectedApps(enabled);
  const revoke = useRevokeConnectedApp();
  const [pending, setPending] = useState<ConnectedApp | null>(null);
  const [failed, setFailed] = useState(false);

  if (!enabled || apps.data === null) return null;
  const list = apps.data ?? [];

  return (
    <Section aria-labelledby="connected-apps-title">
      <SectionTitle id="connected-apps-title">Connected apps</SectionTitle>
      {apps.isLoading ? <Intro role="status">Loading connected apps</Intro> : null}
      {apps.isError ? (
        <Notice $tone="error" role="alert">
          Couldn&apos;t load connected apps.
        </Notice>
      ) : null}
      {!apps.isLoading && !apps.isError && list.length === 0 ? (
        <Intro>No connected apps. Apps you approve with Seald sign-in show up here.</Intro>
      ) : null}
      {list.length > 0 ? (
        <KeyListRoot aria-label="Connected apps">
          {list.map((app) => (
            <KeyRow key={app.id}>
              <KeyMain>
                <KeyText>
                  <KeyName>{app.client_name}</KeyName>
                  <KeyMeta>
                    <span>{app.client_host}</span>
                    {app.unverified ? <Badge tone="amber">Unverified</Badge> : null}
                    <span>
                      Last used {app.last_used_at ? formatShortDate(app.last_used_at) : 'never'}
                    </span>
                  </KeyMeta>
                  <ScopeList aria-label={`${app.client_name} access`}>
                    {app.scopes.map((scope) => (
                      <ScopeChip key={scope}>{SCOPE_LABELS[scope]}</ScopeChip>
                    ))}
                  </ScopeList>
                </KeyText>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Revoke ${app.client_name}`}
                  onClick={() => {
                    setPending(app);
                  }}
                >
                  Revoke
                </Button>
              </KeyMain>
            </KeyRow>
          ))}
        </KeyListRoot>
      ) : null}
      {failed ? (
        <Notice $tone="error" role="alert">
          Couldn&apos;t revoke the app. Try again.
        </Notice>
      ) : null}
      <MWBottomSheet
        open={pending !== null}
        onClose={() => {
          setPending(null);
        }}
        {...(pending ? { title: `Revoke ${pending.client_name}?` } : {})}
      >
        <p>The app loses access right away. Its pending approvals expire.</p>
        <DialogActions>
          <Button
            variant="secondary"
            fullWidth
            data-autofocus
            onClick={() => {
              setPending(null);
            }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            fullWidth
            loading={revoke.isPending}
            onClick={() => {
              if (pending) {
                setFailed(false);
                revoke.mutate(pending.id, {
                  onError: () => {
                    setFailed(true);
                  },
                });
              }
              setPending(null);
            }}
          >
            Revoke
          </Button>
        </DialogActions>
      </MWBottomSheet>
    </Section>
  );
}
