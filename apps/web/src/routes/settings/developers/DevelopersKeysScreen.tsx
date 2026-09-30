import { useEffect, useRef, useState } from 'react';
import {
  API_KEY_EXPIRY_DAY_CHOICES,
  DEFAULT_API_KEY_EXPIRY_DAYS,
  DEFAULT_API_KEY_SCOPES,
  MAX_LIVE_API_KEYS,
  SIGNATURE_LEVEL_NOTE,
  type ApiKeyExpiryDays,
  type ApiKeyScope,
} from 'shared';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { CodeSnippet } from '@/components/CodeSnippet';
import {
  DialogBackdrop,
  DialogCard,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/DialogPrimitives';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { TextField } from '@/components/TextField';
import {
  claudeCodeSnippet,
  cursorSnippet,
  formatDay,
  KEY_PLACEHOLDER,
  keyIsExpired,
  MCP_SERVER_URL,
  SCOPE_LABEL,
} from './copy';
import {
  Actions,
  BackLink,
  Crumb,
  CrumbLink,
  Fieldset,
  Legend,
  Lede,
  Meta,
  Muted,
  Name,
  Notice,
  Page,
  Panel,
  RadioLabel,
  Row,
  RowHead,
  SectionTitle,
  Stack,
  TextButton,
  Tile,
  Tiles,
  Title,
} from './DevelopersKeysScreen.styles';
import type { ApiKeyListItem, DevelopersKeysScreenProps } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

const UNATTENDED_WARNING =
  "An approval from your inbox counts as your approval, even if something else with access to your inbox gave it. Don't let an agent or other software open or act on Seald approval emails.";

const NEW_RECIPIENT_WARNING =
  'New addresses can be approved from your inbox without an earlier send to that address. An approval from your inbox counts as yours.';

type Warning =
  | { readonly kind: 'unattended'; readonly keyId: string }
  | { readonly kind: 'recipients'; readonly keyId: string };

/**
 * Developers keys screen. One column, the same tree on phone and desktop.
 * Scopes and expiry sit behind Advanced. The secret sheet is Copy only.
 */
export function DevelopersKeysScreen(props: DevelopersKeysScreenProps) {
  const {
    layout,
    keys,
    busy = false,
    notice = null,
    revealedSecret = null,
    now = Date.now(),
    sendLoginFresh = false,
    onCreate,
    onRevoke,
    onPatch,
    onDismissSecret,
    onNeedFreshLogin,
  } = props;
  const [pageAdvanced, setPageAdvanced] = useState(false);
  const [createAdvanced, setCreateAdvanced] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...DEFAULT_API_KEY_SCOPES]);
  const [expiry, setExpiry] = useState<ApiKeyExpiryDays>(DEFAULT_API_KEY_EXPIRY_DAYS);
  const [alwaysSignIn, setAlwaysSignIn] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [warning, setWarning] = useState<Warning | null>(null);

  const atCap = keys.length >= MAX_LIVE_API_KEYS;
  const snippetKey = revealedSecret ?? KEY_PLACEHOLDER;
  const revokeTarget = keys.find((key) => key.id === revokeId) ?? null;

  function toggleScope(scope: ApiKeyScope, checked: boolean): void {
    setScopes((current) => {
      if (checked) return current.includes(scope) ? current : [...current, scope];
      if (current.length <= 1) return current;
      return current.filter((item) => item !== scope);
    });
  }

  function submit(): void {
    if (atCap || busy) return;
    if (!createAdvanced) {
      onCreate({});
      return;
    }
    if (scopes.includes('envelopes:send') && !sendLoginFresh) {
      onNeedFreshLogin();
      return;
    }
    onCreate({
      ...(name.trim().length > 0 ? { name: name.trim() } : {}),
      scopes,
      expires_at: new Date(now + expiry * DAY_MS).toISOString(),
      always_require_signin: alwaysSignIn,
    });
  }

  function confirmWarning(): void {
    if (!warning) return;
    if (warning.kind === 'unattended') {
      onPatch(warning.keyId, { require_owner_approval: false });
    } else {
      onPatch(warning.keyId, { allow_new_recipients: true });
    }
    setWarning(null);
  }

  return (
    <Page>
      {layout === 'phone' ? (
        <BackLink to="/m/settings">Back</BackLink>
      ) : (
        <Crumb aria-label="Breadcrumb">
          <CrumbLink to="/settings">Settings</CrumbLink>
          <span aria-hidden> / </span>
          <span>Developers</span>
        </Crumb>
      )}
      <Title>Developers</Title>
      <Lede>
        Keys let an app prepare and send on your behalf. Signers still sign from their own link.
      </Lede>
      <Lede>Any app that can read your email can approve from the email link.</Lede>
      <TextButton
        type="button"
        aria-expanded={pageAdvanced}
        aria-controls="developers-about"
        onClick={() => setPageAdvanced((open) => !open)}
      >
        Advanced
      </TextButton>
      {pageAdvanced ? (
        <Panel id="developers-about">
          <Muted>{SIGNATURE_LEVEL_NOTE}</Muted>
          <Muted>
            {keys.length} of {MAX_LIVE_API_KEYS}
          </Muted>
        </Panel>
      ) : null}

      <Stack>
        {notice ? <Notice role="alert">{notice}</Notice> : null}
        {atCap ? <Notice>You already have 10 keys.</Notice> : null}
        <Actions>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={atCap || busy}
            onClick={submit}
          >
            New key
          </Button>
          <TextButton
            type="button"
            aria-expanded={createAdvanced}
            aria-controls="new-key-advanced"
            onClick={() => setCreateAdvanced((open) => !open)}
          >
            Advanced
          </TextButton>
        </Actions>
        {createAdvanced ? (
          <Panel id="new-key-advanced">
            <TextField label="Name" value={name} onChange={setName} />
            <Fieldset>
              <Legend>Scopes</Legend>
              {scopesPanel(scopes, toggleScope)}
            </Fieldset>
            <Fieldset>
              <Legend>Expiry</Legend>
              {API_KEY_EXPIRY_DAY_CHOICES.map((days) => (
                <RadioLabel key={days}>
                  <input
                    type="radio"
                    name="key-expiry"
                    checked={expiry === days}
                    onChange={() => setExpiry(days)}
                  />
                  {days} days
                </RadioLabel>
              ))}
            </Fieldset>
            <Checkbox
              label="Always require sign-in"
              helpText="Approve needs a session. Deny does not."
              checked={alwaysSignIn}
              onChange={setAlwaysSignIn}
            />
          </Panel>
        ) : null}

        {keys.length === 0 ? <Muted>No keys yet.</Muted> : null}
        {keys.map((key) => (
          <KeyRow
            key={key.id}
            item={key}
            now={now}
            open={openRow === key.id}
            onToggle={() => setOpenRow((current) => (current === key.id ? null : key.id))}
            onRevoke={() => setRevokeId(key.id)}
            onPatch={onPatch}
            onWarn={setWarning}
          />
        ))}
      </Stack>

      <SectionTitle>Connect a client</SectionTitle>
      <Stack>
        <CodeSnippet label="Server" code={MCP_SERVER_URL} />
        <CodeSnippet label="Claude Code" code={claudeCodeSnippet(snippetKey)} />
        <CodeSnippet label="Cursor" code={cursorSnippet(snippetKey)} />
        <Tiles>
          <Tile>
            ChatGPT <Badge tone="neutral">Later</Badge>
          </Tile>
          <Tile>
            Claude <Badge tone="neutral">Later</Badge>
          </Tile>
        </Tiles>
      </Stack>

      {revealedSecret ? (
        <SecretOnceSheet secret={revealedSecret} onClose={onDismissSecret} />
      ) : null}
      {revokeTarget ? (
        <ConfirmDialog
          title={`Revoke ${revokeTarget.name}?`}
          body="This key stops working."
          confirmLabel="Revoke"
          danger
          onCancel={() => setRevokeId(null)}
          onConfirm={() => {
            onRevoke(revokeTarget.id);
            setRevokeId(null);
          }}
        />
      ) : null}
      {warning ? (
        <ConfirmDialog
          title={warning.kind === 'unattended' ? 'Send without waiting' : 'Allow new recipients'}
          body={warning.kind === 'unattended' ? UNATTENDED_WARNING : NEW_RECIPIENT_WARNING}
          confirmLabel="Turn on"
          onCancel={() => setWarning(null)}
          onConfirm={confirmWarning}
        />
      ) : null}
    </Page>
  );
}

function scopesPanel(
  selected: readonly ApiKeyScope[],
  toggle: (scope: ApiKeyScope, checked: boolean) => void,
) {
  return (
    <>
      {(
        [
          'envelopes:read',
          'envelopes:write',
          'documents:write',
          'envelopes:send',
          'contacts:read',
          'contacts:write',
          'templates:read',
          'templates:write',
          'gdrive:read',
          'gdrive:write',
          'automations:read',
          'automations:write',
        ] as const
      ).map((scope) => (
        <Checkbox
          key={scope}
          label={SCOPE_LABEL[scope]}
          helpText={scope === 'envelopes:send' ? 'Needs a recent sign-in.' : undefined}
          checked={selected.includes(scope)}
          onChange={(checked) => toggle(scope, checked)}
        />
      ))}
    </>
  );
}

function KeyRow(props: {
  readonly item: ApiKeyListItem;
  readonly now: number;
  readonly open: boolean;
  readonly onToggle: () => void;
  readonly onRevoke: () => void;
  readonly onPatch: DevelopersKeysScreenProps['onPatch'];
  readonly onWarn: (warning: Warning) => void;
}) {
  const { item, now, open, onToggle, onRevoke, onPatch, onWarn } = props;
  const expired = keyIsExpired(item.expires_at, now);
  const panelId = `key-advanced-${item.id}`;
  return (
    <Row>
      <RowHead>
        <div>
          <Name>{item.name}</Name>
          <Meta>{item.prefix}</Meta>
          <Meta>{item.expires_at ? `Expires ${formatDay(item.expires_at)}` : 'Expires'}</Meta>
        </div>
        {expired ? <Badge tone="amber">Expired</Badge> : null}
      </RowHead>
      <Actions>
        <Button type="button" variant="danger" size="md" onClick={onRevoke}>
          Revoke
        </Button>
        <TextButton type="button" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
          Advanced
        </TextButton>
      </Actions>
      {open ? (
        <Panel id={panelId}>
          <Muted>
            {item.last_used_at ? `Last used ${formatDay(item.last_used_at)}` : 'Not used yet'}
          </Muted>
          <Muted>{item.scopes.map((scope) => SCOPE_LABEL[scope]).join(', ')}</Muted>
          <Checkbox
            label="Always require sign-in"
            checked={item.always_require_signin}
            onChange={(checked) => onPatch(item.id, { always_require_signin: checked })}
          />
          <Checkbox
            label="Send without waiting"
            helpText="Off until you turn it on. Sends then go out in the same turn."
            checked={!item.require_owner_approval}
            onChange={(checked) => {
              if (checked) onWarn({ kind: 'unattended', keyId: item.id });
              else onPatch(item.id, { require_owner_approval: true });
            }}
          />
          <Checkbox
            label="Allow new recipients"
            checked={item.allow_new_recipients}
            onChange={(checked) => {
              if (checked) onWarn({ kind: 'recipients', keyId: item.id });
              else onPatch(item.id, { allow_new_recipients: false });
            }}
          />
          <Checkbox
            label="Email me to approve"
            checked={item.approval_notify === 'email'}
            onChange={(checked) =>
              onPatch(item.id, { approval_notify: checked ? 'email' : 'none' })
            }
          />
        </Panel>
      ) : null}
    </Row>
  );
}

function ConfirmDialog(props: {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly danger?: boolean | undefined;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const { title, body, confirmLabel, danger = false, onCancel, onConfirm } = props;
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);
  return (
    <DialogBackdrop onClick={onCancel}>
      <DialogCard
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <DialogTitle id="confirm-dialog-title">{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter>
          <Button ref={cancelRef} type="button" variant="secondary" size="lg" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={danger ? 'danger' : 'primary'}
            size="lg"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogCard>
    </DialogBackdrop>
  );
}
