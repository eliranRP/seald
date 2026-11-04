import { useState } from 'react';
import type { FormEvent, Ref } from 'react';
import type { OwnerAutomation, UpdateAutomationRequest } from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Disclosure } from '@/components/Disclosure';
import { TextField } from '@/components/TextField';
import { Actions, AdvancedBox, Form, Notice } from './automations.styles';

export interface EditAutomationFormProps {
  readonly automation: OwnerAutomation;
  readonly busy: boolean;
  readonly problem?: string | undefined;
  readonly saved: boolean;
  readonly onSave: (body: UpdateAutomationRequest) => void;
  /** The field "Fix" moves focus to: the address for a webhook, the name otherwise. */
  readonly fixFieldRef: Ref<HTMLInputElement>;
}

/** Rename an automation, and for a webhook replace its address. A blank address keeps the current one. */
export function EditAutomationForm({
  automation,
  busy,
  problem,
  saved,
  onSave,
  fixFieldRef,
}: EditAutomationFormProps) {
  const webhook = automation.action === 'webhook';
  const [name, setName] = useState(automation.name);
  const [url, setUrl] = useState('');
  const [withSigner, setWithSigner] = useState(automation.payload_detail === 'with_signer');

  const body: UpdateAutomationRequest = {
    ...(name.trim() !== '' && name.trim() !== automation.name ? { name: name.trim() } : {}),
    ...(webhook && url.trim() !== '' ? { url: url.trim() } : {}),
    ...(webhook && withSigner !== (automation.payload_detail === 'with_signer')
      ? { payload_detail: withSigner ? ('with_signer' as const) : ('ids' as const) }
      : {}),
  };
  const changed = Object.keys(body).length > 0;
  // Save stays live (a disabled button can't say why); a click with nothing
  // changed says what to change instead.
  const [nudged, setNudged] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (changed) onSave(body);
    else setNudged(true);
  };

  return (
    <Form onSubmit={submit} aria-label="Edit this automation">
      <TextField
        ref={webhook ? undefined : fixFieldRef}
        label="Name"
        value={name}
        onChange={setName}
        maxLength={80}
      />
      {webhook ? (
        <TextField
          ref={fixFieldRef}
          label="Webhook address"
          type="url"
          inputMode="url"
          autoComplete="off"
          placeholder={`Leave blank to keep ${automation.destination_host ?? 'the current address'}`}
          helpText="Seald sends a signed message here. It must be a public https address."
          value={url}
          onChange={setUrl}
        />
      ) : null}
      {webhook ? (
        <Disclosure label="Advanced" ariaLabel="Advanced edit options">
          <AdvancedBox>
            <Checkbox
              label="Include the signer's name and email"
              hint="These details leave Seald and go to your address."
              checked={withSigner}
              onChange={setWithSigner}
            />
          </AdvancedBox>
        </Disclosure>
      ) : null}
      {problem ? (
        <Notice $tone="error" role="alert">
          {problem}
        </Notice>
      ) : null}
      {saved && !problem ? <Notice role="status">Saved.</Notice> : null}
      {nudged && !changed ? (
        <Notice role="status">
          {webhook
            ? 'Nothing to save yet. Change the name or the address first.'
            : 'Nothing to save yet. Change the name first.'}
        </Notice>
      ) : null}
      <Actions>
        <Button type="submit" variant="primary" loading={busy}>
          Save
        </Button>
      </Actions>
    </Form>
  );
}
