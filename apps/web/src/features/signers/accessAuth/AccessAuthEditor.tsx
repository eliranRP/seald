import { useId } from 'react';
import { Mail } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { Icon } from '@/components/Icon';
import {
  Copy,
  CopyCol,
  Input as SwitchInput,
  Root as SwitchRoot,
  Text as SwitchText,
} from '@/components/ReminderToggle/ReminderToggle.styles';
import { overrideOf, setOverride } from './model';
import type { AccessAuthOverride, AccessAuthValue } from './model';
import {
  Choice,
  ChoiceLabel,
  Overrides,
  Root,
  Select,
  SignerBlock,
  SignerLegend,
} from './AccessAuthEditor.styles';

export interface AccessAuthSigner {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface AccessAuthEditorProps {
  readonly signers: ReadonlyArray<AccessAuthSigner>;
  readonly value: AccessAuthValue;
  readonly onChange: (next: AccessAuthValue) => void;
  readonly disabled?: boolean | undefined;
}

const OPTIONS: ReadonlyArray<{ readonly value: AccessAuthOverride; readonly label: string }> = [
  { value: 'inherit', label: 'Same as the whole document' },
  { value: 'on', label: 'Require a code' },
  { value: 'off', label: 'No code' },
];

function isOverride(v: string): v is AccessAuthOverride {
  return v === 'inherit' || v === 'on' || v === 'off';
}

/**
 * Sender control for the emailed one-time code (WP-11). Two switches apply
 * to the whole document: a code to open it, and a fresh code right before
 * signing. A per-recipient section can override either one. Copy says
 * "emailed one-time code": it proves access to the mailbox, nothing more.
 * Renders nothing while the `signerAccessAuth` flag is off.
 */
export function AccessAuthEditor({
  signers,
  value,
  onChange,
  disabled = false,
}: AccessAuthEditorProps) {
  const accessId = useId();
  const accessTitleId = useId();
  const accessHintId = useId();
  const actionId = useId();
  const actionTitleId = useId();
  const actionHintId = useId();
  const baseId = useId();
  if (!isFeatureEnabled('signerAccessAuth')) return null;

  const apply = (
    id: string,
    patch: Partial<{ access: AccessAuthOverride; action: AccessAuthOverride }>,
  ) => onChange(setOverride(value, id, patch));

  return (
    <Root aria-label="Emailed one-time code">
      <SwitchRoot htmlFor={accessId}>
        <SwitchInput
          id={accessId}
          type="checkbox"
          role="switch"
          checked={value.access}
          disabled={disabled}
          aria-labelledby={accessTitleId}
          aria-describedby={accessHintId}
          onChange={(event) => onChange({ ...value, access: event.currentTarget.checked })}
        />
        <CopyCol>
          <SwitchText id={accessTitleId}>
            <Icon icon={Mail} size={16} />
            Require an emailed code to open
          </SwitchText>
          <Copy id={accessHintId}>
            Each signer enters a one-time code we email them before they can open the document.
          </Copy>
        </CopyCol>
      </SwitchRoot>
      <SwitchRoot htmlFor={actionId}>
        <SwitchInput
          id={actionId}
          type="checkbox"
          role="switch"
          checked={value.action}
          disabled={disabled}
          aria-labelledby={actionTitleId}
          aria-describedby={actionHintId}
          onChange={(event) => onChange({ ...value, action: event.currentTarget.checked })}
        />
        <CopyCol>
          <SwitchText id={actionTitleId}>Ask again before signing</SwitchText>
          <Copy id={actionHintId}>
            Signers enter a fresh emailed code right before they submit. It covers everything they
            fill in, not only the signature.
          </Copy>
        </CopyCol>
      </SwitchRoot>
      {signers.length > 0 ? (
        <Overrides>
          <summary>Per-recipient settings</summary>
          {signers.map((signer) => {
            const o = overrideOf(value, signer.id);
            return (
              <SignerBlock key={signer.id} disabled={disabled}>
                <SignerLegend>{signer.name}</SignerLegend>
                <Choice>
                  <ChoiceLabel htmlFor={`${baseId}-${signer.id}-access`}>
                    Code to open for {signer.name}
                  </ChoiceLabel>
                  <Select
                    id={`${baseId}-${signer.id}-access`}
                    value={o.access}
                    onChange={(e) => {
                      if (isOverride(e.target.value)) apply(signer.id, { access: e.target.value });
                    }}
                  >
                    {OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </Choice>
                <Choice>
                  <ChoiceLabel htmlFor={`${baseId}-${signer.id}-action`}>
                    Code before signing for {signer.name}
                  </ChoiceLabel>
                  <Select
                    id={`${baseId}-${signer.id}-action`}
                    value={o.action}
                    onChange={(e) => {
                      if (isOverride(e.target.value)) apply(signer.id, { action: e.target.value });
                    }}
                  >
                    {OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </Choice>
              </SignerBlock>
            );
          })}
        </Overrides>
      ) : null}
    </Root>
  );
}
