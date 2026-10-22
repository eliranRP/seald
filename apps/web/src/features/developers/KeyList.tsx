import { useState } from 'react';
import type { ApiKey } from 'shared';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { formatShortDate } from '@/lib/dateFormat';
import { Disclosure } from './Disclosure';
import { isExpired, SCOPE_LABELS } from './model';
import {
  Detail,
  DialogActions,
  KeyListRoot,
  KeyMain,
  KeyMeta,
  KeyName,
  KeyRow,
  KeyText,
  Mono,
  ScopeChip,
  ScopeList,
} from './DevelopersPanel.styles';

export interface KeyListProps {
  readonly keys: ReadonlyArray<ApiKey>;
  readonly onRevoke: (id: string) => void;
  readonly revoking: boolean;
}

/** Up to 10 live keys: name, prefix, expiry, and Revoke on the row. */
export function KeyList({ keys, onRevoke, revoking }: KeyListProps) {
  const [pending, setPending] = useState<ApiKey | null>(null);

  return (
    <>
      <KeyListRoot aria-label="API keys">
        {keys.map((key) => {
          const expired = isExpired(key);
          return (
            <KeyRow key={key.id}>
              <KeyMain>
                <KeyText>
                  <KeyName>{key.name}</KeyName>
                  <KeyMeta>
                    <Mono>{key.prefix}</Mono>
                    {expired ? (
                      <Badge tone="red">Expired</Badge>
                    ) : (
                      <span>Expires {formatShortDate(key.expires_at)}</span>
                    )}
                  </KeyMeta>
                </KeyText>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Revoke ${key.name}`}
                  onClick={() => {
                    setPending(key);
                  }}
                >
                  Revoke
                </Button>
              </KeyMain>
              <Disclosure label="Advanced" ariaLabel={`Advanced details for ${key.name}`}>
                <Detail>
                  <span>
                    Last used {key.last_used_at ? formatShortDate(key.last_used_at) : 'never'}
                  </span>
                  <ScopeList aria-label={`${key.name} access`}>
                    {key.scopes.map((scope) => (
                      <ScopeChip key={scope}>{SCOPE_LABELS[scope]}</ScopeChip>
                    ))}
                  </ScopeList>
                  <span>Always require sign-in: {key.always_require_signin ? 'On' : 'Off'}</span>
                </Detail>
              </Disclosure>
            </KeyRow>
          );
        })}
      </KeyListRoot>
      <MWBottomSheet
        open={pending !== null}
        onClose={() => {
          setPending(null);
        }}
        {...(pending ? { title: `Revoke ${pending.name}?` } : {})}
      >
        <p>The apps using this key stop working right away.</p>
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
            loading={revoking}
            onClick={() => {
              if (pending) onRevoke(pending.id);
              setPending(null);
            }}
          >
            Revoke
          </Button>
        </DialogActions>
      </MWBottomSheet>
    </>
  );
}
