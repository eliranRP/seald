import { useState } from 'react';
import {
  API_KEY_DEFAULT_SCOPES,
  API_KEY_DEFAULT_TTL_DAYS,
  API_KEY_NAME_MAX,
  API_KEY_SCOPES,
  API_KEY_TTL_CHOICES_DAYS,
  type ApiKeyScope,
  type CreateApiKeyRequest,
} from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { expiryFromDays, SCOPE_LABELS } from './model';
import {
  AdvancedBox,
  Choice,
  ChoiceRow,
  Field,
  Fieldset,
  Legend,
  TextInput,
} from './DevelopersPanel.styles';

export interface CreateKeyAdvancedProps {
  readonly busy: boolean;
  readonly onCreate: (body: CreateApiKeyRequest) => void;
}

/**
 * Advanced create: name, scopes, expiry, "Always require sign-in". Only
 * `envelopes:read` is pre-checked, 90 days is selected, and there is no
 * Never choice (the API rejects a null expiry).
 */
export function CreateKeyAdvanced({ busy, onCreate }: CreateKeyAdvancedProps) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<ReadonlySet<ApiKeyScope>>(
    () => new Set(API_KEY_DEFAULT_SCOPES),
  );
  const [days, setDays] = useState<number>(API_KEY_DEFAULT_TTL_DAYS);
  const [alwaysSignIn, setAlwaysSignIn] = useState(false);

  const toggleScope = (scope: ApiKeyScope, on: boolean): void => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (on) next.add(scope);
      else next.delete(scope);
      return next;
    });
  };

  const submit = (): void => {
    const picked = API_KEY_SCOPES.filter((s) => scopes.has(s));
    const trimmed = name.trim();
    onCreate({
      ...(trimmed ? { name: trimmed } : {}),
      scopes: picked,
      expires_at: expiryFromDays(days),
      ...(alwaysSignIn ? { always_require_signin: true } : {}),
    });
  };

  const pickedScopes = API_KEY_SCOPES.filter((s) => scopes.has(s));

  return (
    <AdvancedBox>
      <Field>
        Name
        <TextInput
          type="text"
          value={name}
          maxLength={API_KEY_NAME_MAX}
          placeholder="Key name"
          onChange={(e) => {
            setName(e.currentTarget.value);
          }}
        />
      </Field>
      <Fieldset>
        <Legend>Access</Legend>
        {API_KEY_SCOPES.map((scope) => (
          <Checkbox
            key={scope}
            label={SCOPE_LABELS[scope]}
            hint={scope}
            checked={scopes.has(scope)}
            onChange={(on) => {
              toggleScope(scope, on);
            }}
          />
        ))}
      </Fieldset>
      <Fieldset>
        <Legend>Expires in</Legend>
        <ChoiceRow>
          {API_KEY_TTL_CHOICES_DAYS.map((choice) => (
            <Choice key={choice}>
              <input
                type="radio"
                name="key-expiry"
                checked={days === choice}
                onChange={() => {
                  setDays(choice);
                }}
              />
              {choice} days
            </Choice>
          ))}
        </ChoiceRow>
      </Fieldset>
      <Checkbox
        label="Always require sign-in"
        hint="Approve needs a sign-in. Deny never does."
        checked={alwaysSignIn}
        onChange={setAlwaysSignIn}
      />
      <div>
        <Button
          variant="primary"
          loading={busy}
          disabled={pickedScopes.length === 0}
          onClick={submit}
        >
          Create key
        </Button>
      </div>
    </AdvancedBox>
  );
}
