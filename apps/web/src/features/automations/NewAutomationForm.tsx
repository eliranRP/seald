import { useState } from 'react';
import type { FormEvent } from 'react';
import type { CreateAutomationRequest } from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { Disclosure } from '@/components/Disclosure';
import { TextField } from '@/components/TextField';
import { Actions, AdvancedBox, Form, Intro, Notice } from './automations.styles';
import type { RecipeCard } from './model';

export interface NewAutomationFormProps {
  readonly card: RecipeCard;
  readonly busy: boolean;
  /** Plain-language reason the last save failed. */
  readonly problem?: string | undefined;
  readonly onSave: (body: CreateAutomationRequest) => void;
  readonly onCancel: () => void;
}

/**
 * The one-screen create. A webhook asks for its address; Drive and email
 * ask for nothing. Save turns the automation on: the owner is the one
 * saving, so nothing waits for an approval.
 */
export function NewAutomationForm({
  card,
  busy,
  problem,
  onSave,
  onCancel,
}: NewAutomationFormProps) {
  const [url, setUrl] = useState('');
  const [withSigner, setWithSigner] = useState(false);
  const webhook = card.kind === 'webhook';

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSave({
      recipe: card.id,
      ...(webhook ? { url: url.trim() } : {}),
      ...(webhook && withSigner ? { payload_detail: 'with_signer' as const } : {}),
    });
  };

  return (
    <Form onSubmit={submit} aria-label={card.title}>
      <Intro>{card.line}</Intro>
      {webhook ? (
        <>
          <TextField
            label="Webhook address"
            type="url"
            inputMode="url"
            autoComplete="off"
            placeholder="https://example.com/hooks/seald"
            helpText="Seald sends a signed message here. It must be a public https address."
            value={url}
            onChange={setUrl}
            required
          />
          <Disclosure label="Advanced" ariaLabel="Advanced options">
            <AdvancedBox>
              <Checkbox
                label="Include the signer's name and email"
                hint="These details leave Seald and go to the address above."
                checked={withSigner}
                onChange={setWithSigner}
              />
            </AdvancedBox>
          </Disclosure>
        </>
      ) : null}
      {card.kind === 'drive' ? (
        <Intro>Saved to My Drive / Seald. There is no folder to pick.</Intro>
      ) : null}
      {card.kind === 'email' ? <Intro>It goes to the email address on your account.</Intro> : null}
      {problem ? (
        <Notice $tone="error" role="alert">
          {problem}
        </Notice>
      ) : null}
      <Actions>
        <Button
          type="submit"
          variant="primary"
          loading={busy}
          disabled={webhook && url.trim() === ''}
        >
          {webhook ? 'Save' : 'Turn on'}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </Actions>
    </Form>
  );
}
