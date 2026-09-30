import { useId, useRef, useState } from 'react';
import {
  API_KEY_EXPIRY_DAY_CHOICES,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_API_KEY_SCOPES,
  MAX_LIVE_API_KEYS,
  type ApiKeyExpiryDays,
  type ApiKeyScope,
} from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { TextField } from '@/components/TextField';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  CREATABLE_SCOPES,
  SCOPE_LABEL,
  expiryChoiceLabel,
  expiryLine,
  keyIsExpired,
  keyMetaLine,
} from './copy';
import {
  Actions,
  BackLink,
  CapNote,
  Crumb,
  CrumbLink,
  Expiry,
  Fieldset,
  Lede,
  Legend,
  Meta,
  Muted,
  Name,
  Notice,
  Page,
  Panel,
  Row,
  RowHead,
  Segment,
  SegmentOption,
  Stack,
  TextButton,
  Title,
  Toast,
} from './DevelopersKeysScreen.styles';
import type { ApiKeyListItem, DevelopersKeysScreenProps } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Developers keys screen. One New key action, with name, scopes, and
 * expiry behind a single Advanced link.
 */
export function DevelopersKeysScreen(props: DevelopersKeysScreenProps) {
  const {
    layout,
    keys,
    status = 'ready',
    creating = false,
    notice = null,
    toast = null,
    revealedSecret = null,
    now = Date.now(),
    initialAdvanced = false,
    revokeOpen = false,
    onCreate,
    onRevoke,
    onDismissSecret,
    onRetry,
  } = props;
  const [advanced, setAdvanced] = useState(initialAdvanced);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...DEFAULT_API_KEY_SCOPES]);
  const [expiry, setExpiry] = useState<ApiKeyExpiryDays>(DEFAULT_API_KEY_EXPIRY_DAYS);
  const [alwaysSignIn, setAlwaysSignIn] = useState(false);
  const [revokeId, setRevokeId] = useState<string | null>(
    revokeOpen ? (keys[0]?.id ?? null) : null,
  );

  const occupying = keys.filter((key) => !keyIsExpired(key.expires_at, now)).length;
  const atCap = occupying >= MAX_LIVE_API_KEYS;
  const revokeTarget = keys.find((key) => key.id === revokeId) ?? null;

  function toggleScope(scope: ApiKeyScope, checked: boolean): void {
    setScopes((current) => {
      if (checked) return current.includes(scope) ? current : [...current, scope];
      if (current.length <= 1) return current;
      return current.filter((item) => item !== scope);
    });
  }

  function submit(): void {
    if (atCap || creating || status !== 'ready') return;
    if (!advanced) {
      onCreate({});
      return;
    }
    onCreate({
      ...(name.trim().length > 0 ? { name: name.trim() } : {}),
      scopes,
      expires_at: new Date(now + expiry * DAY_MS).toISOString(),
      always_require_signin: alwaysSignIn,
    });
  }

  return (
    <Page>
      <ScreenHeader layout={layout} />
      <Title>Developers</Title>
      <Lede>Keys let an app prepare and send for you. Signers still sign from their own link.</Lede>

      {status === 'error' ? (
        <Stack>
          <Notice role="alert">Could not load keys.</Notice>
          {onRetry ? (
            <Button type="button" variant="secondary" size="lg" onClick={onRetry}>
              Try again
            </Button>
          ) : null}
        </Stack>
      ) : (
        <Stack>
          {notice ? <Notice role="alert">{notice}</Notice> : null}
          {status === 'ready' && atCap ? (
            <CapNote>You have {MAX_LIVE_API_KEYS} keys. Revoke one to add another.</CapNote>
          ) : null}
          <Actions>
            <Button
              type="button"
              variant="primary"
              size="lg"
              loading={creating}
              disabled={atCap || status === 'loading'}
              onClick={submit}
            >
              New key
            </Button>
            <TextButton
              type="button"
              aria-expanded={advanced}
              aria-controls="new-key-advanced"
              onClick={() => setAdvanced((open) => !open)}
            >
              Advanced
            </TextButton>
          </Actions>
          {advanced ? (
            <Panel id="new-key-advanced">
              <TextField label="Name" value={name} onChange={setName} />
              <Fieldset>
                <Legend>Scopes</Legend>
                {CREATABLE_SCOPES.map((scope) => (
                  <Checkbox
                    key={scope}
                    label={SCOPE_LABEL[scope]}
                    checked={scopes.includes(scope)}
                    onChange={(checked) => toggleScope(scope, checked)}
                  />
                ))}
              </Fieldset>
              <Fieldset>
                <Legend>Expiry</Legend>
                <Segment role="radiogroup" aria-label="Expiry">
                  {API_KEY_EXPIRY_DAY_CHOICES.map((days) => (
                    <SegmentOption key={days} $on={expiry === days}>
                      <input
                        type="radio"
                        name="key-expiry"
                        checked={expiry === days}
                        onChange={() => setExpiry(days)}
                      />
                      {expiryChoiceLabel(days)}
                    </SegmentOption>
                  ))}
                </Segment>
              </Fieldset>
              <Checkbox
                label="Always require sign-in"
                checked={alwaysSignIn}
                onChange={setAlwaysSignIn}
              />
            </Panel>
          ) : null}

          {status === 'loading' ? <Muted>Loading…</Muted> : null}
          {status === 'ready' && keys.length === 0 ? <Muted>No keys yet.</Muted> : null}
          {status === 'ready'
            ? keys.map((key) => (
                <KeyRow key={key.id} item={key} now={now} onRevoke={() => setRevokeId(key.id)} />
              ))
            : null}
        </Stack>
      )}

      {toast ? <Toast role="status">{toast}</Toast> : null}
      {revealedSecret ? (
        <SecretOnceSheet secret={revealedSecret} onClose={onDismissSecret} />
      ) : null}
      {revokeTarget ? (
        <RevokeDialog
          name={revokeTarget.name}
          prefix={revokeTarget.prefix}
          onCancel={() => setRevokeId(null)}
          onConfirm={() => {
            onRevoke(revokeTarget.id);
            setRevokeId(null);
          }}
        />
      ) : null}
    </Page>
  );
}

function ScreenHeader(props: { readonly layout: 'desktop' | 'phone' }) {
  if (props.layout === 'phone') return <BackLink to="/m/settings">Back</BackLink>;
  return (
    <Crumb aria-label="Breadcrumb">
      <CrumbLink to="/settings">Settings</CrumbLink>
      <span aria-hidden> / </span>
      <span>Developers</span>
    </Crumb>
  );
}

function KeyRow(props: {
  readonly item: ApiKeyListItem;
  readonly now: number;
  readonly onRevoke: () => void;
}) {
  const { item, now, onRevoke } = props;
  return (
    <Row>
      <RowHead>
        <div>
          <Name>{item.name}</Name>
          <Meta dir="ltr">{item.prefix}</Meta>
          <Expiry>{expiryLine(item.expires_at, now)}</Expiry>
        </div>
        <Button type="button" variant="danger" size="md" onClick={onRevoke}>
          Revoke
        </Button>
      </RowHead>
      <Muted>{keyMetaLine(item)}</Muted>
    </Row>
  );
}

function RevokeDialog(props: {
  readonly name: string;
  readonly prefix: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { name, prefix, onCancel, onConfirm } = props;
  const titleId = useId();
  const descId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { onKeyDown } = useFocusTrap(cardRef, {
    enabled: true,
    initialFocusRef: cancelRef,
    onEscape: onCancel,
  });
  return (
    <DialogBackdrop role="presentation" onClick={onCancel}>
      <DialogCard
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <DialogTitle id={titleId}>Revoke {name}?</DialogTitle>
        <DialogDescription id={descId}>
          Apps using <span dir="ltr">{prefix}</span> stop working now.
        </DialogDescription>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="button" variant="danger" size="lg" onClick={onConfirm}>
            Revoke
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
