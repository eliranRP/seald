import { useId, useState } from 'react';
import { DIRECT_LINK_DAILY_CAP_DEFAULT, DIRECT_LINK_DAILY_CAP_MAX } from 'shared';
import type { DirectLink, DirectLinkWithToken } from 'shared';
import { Button } from '@/components/Button';
import { Checkbox } from '@/components/Checkbox';
import { SecretOnceSheet } from '@/components/SecretOnceSheet';
import { TextField } from '@/components/TextField';
import {
  directLinkUrl,
  useCreateDirectLink,
  useDeleteDirectLink,
  useDirectLink,
  useRotateDirectLink,
  useUpdateDirectLink,
} from './directLinksApi';
import {
  Actions,
  Confirm,
  Field,
  Heading,
  Hint,
  Intro,
  Label,
  Mono,
  Notice,
  NumberInput,
  Root,
  Select,
  Summary,
} from './DirectLinkPanel.styles';

export interface DirectLinkSlot {
  readonly id: string;
  readonly name: string;
  readonly email: string;
}

export interface DirectLinkPanelProps {
  readonly template: {
    readonly id: string;
    readonly name: string;
    readonly hasExamplePdf: boolean;
    readonly lastSigners: ReadonlyArray<DirectLinkSlot>;
  };
}

const ERROR_COPY: ReadonlyArray<readonly [string, string]> = [
  ['template_needs_example_pdf', 'Save an example PDF with this template first.'],
  [
    'signer_without_signature_field',
    'Every signer on the template needs a signature or initials field.',
  ],
  ['signer_slot_invalid', 'Pick one of the signers saved on this template.'],
  ['direct_link_exists', 'This template already has a direct link.'],
  ['sender_email_missing', 'Sign in with an email address to create a direct link.'],
];

/** Plain-language text for an API error from the owner routes. */
export function directLinkErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : '';
  const known = ERROR_COPY.find(([slug]) => message.includes(slug));
  return known ? known[1] : 'Something went wrong. Try again.';
}

type Pending = 'rotate' | 'remove' | null;

/**
 * Template settings: the one public direct link a template may have.
 *
 * Anyone with the link enters a name and an email; a new envelope is made
 * from the template with that person in the chosen signer slot, and they get
 * the normal signing email. The full link is shown once, right after it is
 * created or rotated (the server keeps only a hash). Turning the link off
 * keeps the same URL; rotating gives a new one and stops the old one at once.
 */
export function DirectLinkPanel({ template }: DirectLinkPanelProps) {
  const headingId = useId();
  const slotId = useId();
  const capId = useId();
  const link = useDirectLink(template.id);
  const create = useCreateDirectLink(template.id);
  const update = useUpdateDirectLink(template.id);
  const rotate = useRotateDirectLink(template.id);
  const remove = useDeleteDirectLink(template.id);

  const [slot, setSlot] = useState<string | null>(null);
  const [senderName, setSenderName] = useState<string | null>(null);
  const [cap, setCap] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);

  const current: DirectLink | null | undefined = link.data;
  const slots = template.lastSigners;
  const chosenSlot = slot ?? current?.signer_slot ?? slots[0]?.id ?? '';
  const chosenName = senderName ?? current?.sender_name ?? '';
  const chosenCap = cap ?? String(current?.daily_cap ?? DIRECT_LINK_DAILY_CAP_DEFAULT);
  const capNumber = Number(chosenCap);
  const capValid =
    Number.isInteger(capNumber) && capNumber >= 1 && capNumber <= DIRECT_LINK_DAILY_CAP_MAX;
  const ready = template.hasExamplePdf && slots.length > 0;

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    setError(null);
    try {
      return await action();
    } catch (err) {
      setError(directLinkErrorMessage(err));
      return null;
    }
  }

  function showToken(res: DirectLinkWithToken | null): void {
    if (res) setRevealed(directLinkUrl(res.token));
  }

  async function onCreate(): Promise<void> {
    showToken(
      await run(() =>
        create.mutateAsync({
          signer_slot: chosenSlot,
          daily_cap: capNumber,
          ...(chosenName.trim() ? { sender_name: chosenName.trim() } : {}),
        }),
      ),
    );
  }

  async function onSave(): Promise<void> {
    await run(() =>
      update.mutateAsync({
        signer_slot: chosenSlot,
        daily_cap: capNumber,
        sender_name: chosenName.trim() ? chosenName.trim() : null,
      }),
    );
  }

  async function onRotate(): Promise<void> {
    setPending(null);
    showToken(await run(() => rotate.mutateAsync()));
  }

  async function onRemove(): Promise<void> {
    setPending(null);
    await run(() => remove.mutateAsync());
  }

  const slotField = (
    <Field>
      <Label htmlFor={slotId}>Person who opens the link signs as</Label>
      <Select id={slotId} value={chosenSlot} onChange={(e) => setSlot(e.target.value)}>
        {slots.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.email})
          </option>
        ))}
      </Select>
      <Hint>The other signers on the template are added as saved.</Hint>
    </Field>
  );

  const nameField = (
    <TextField
      label="Name shown on the public page"
      helpText="Optional. The page shows this name and the template title, nothing else."
      value={chosenName}
      maxLength={120}
      onChange={(v) => setSenderName(v)}
    />
  );

  const capField = (
    <Field>
      <Label htmlFor={capId}>New requests allowed per day</Label>
      <NumberInput
        id={capId}
        type="number"
        min={1}
        max={DIRECT_LINK_DAILY_CAP_MAX}
        value={chosenCap}
        aria-invalid={!capValid}
        onChange={(e) => setCap(e.target.value)}
      />
      {capValid ? null : (
        <Hint role="alert">Enter a number from 1 to {DIRECT_LINK_DAILY_CAP_MAX}.</Hint>
      )}
    </Field>
  );

  let body;
  if (link.isLoading) {
    body = <Intro role="status">Loading direct link…</Intro>;
  } else if (link.isError) {
    body = (
      <Notice $tone="error" role="alert">
        Direct links are not available right now.
      </Notice>
    );
  } else if (!current) {
    body = (
      <>
        {template.hasExamplePdf ? null : (
          <Notice>Save an example PDF with this template to turn on a direct link.</Notice>
        )}
        {slots.length === 0 ? (
          <Notice>Add at least one signer to this template first.</Notice>
        ) : null}
        {ready ? (
          <>
            {slotField}
            {nameField}
            {capField}
          </>
        ) : null}
        <Actions>
          <Button
            variant="primary"
            disabled={!ready || !capValid}
            loading={create.isPending}
            onClick={() => void onCreate()}
          >
            Create direct link
          </Button>
        </Actions>
      </>
    );
  } else {
    body = (
      <>
        <Summary aria-label="Direct link status">
          <dt>Link</dt>
          <dd>
            <Mono>{current.prefix}…</Mono> (the full link was shown once)
          </dd>
          <dt>Status</dt>
          <dd>{current.enabled ? 'On' : 'Off'}</dd>
          <dt>Today</dt>
          <dd>
            {current.created_last_24h} of {current.daily_cap} new requests in the last 24 hours
          </dd>
        </Summary>
        <Checkbox
          checked={current.enabled}
          disabled={update.isPending}
          label="Accept new signers"
          hint="Turning this off keeps the same link. Anyone who opens it sees that it is not available."
          onChange={(enabled) => void run(() => update.mutateAsync({ enabled }))}
        />
        {slotField}
        {nameField}
        {capField}
        <Actions>
          <Button
            variant="secondary"
            disabled={!capValid}
            loading={update.isPending}
            onClick={() => void onSave()}
          >
            Save changes
          </Button>
          <Button variant="secondary" onClick={() => setPending('rotate')}>
            Rotate link
          </Button>
          <Button variant="danger" onClick={() => setPending('remove')}>
            Remove link
          </Button>
        </Actions>
        {pending === 'rotate' ? (
          <Confirm role="group" aria-label="Confirm rotate">
            <Intro>
              Rotating makes a new link and stops the old one right away. Share the new one with the
              people who need it.
            </Intro>
            <Actions>
              <Button variant="primary" loading={rotate.isPending} onClick={() => void onRotate()}>
                Rotate now
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </Actions>
          </Confirm>
        ) : null}
        {pending === 'remove' ? (
          <Confirm role="group" aria-label="Confirm remove">
            <Intro>Removing the link stops it for good. You can create a new one later.</Intro>
            <Actions>
              <Button variant="danger" loading={remove.isPending} onClick={() => void onRemove()}>
                Remove now
              </Button>
              <Button variant="ghost" onClick={() => setPending(null)}>
                Cancel
              </Button>
            </Actions>
          </Confirm>
        ) : null}
      </>
    );
  }

  return (
    <Root aria-labelledby={headingId}>
      <Heading id={headingId}>Direct link</Heading>
      <Intro>
        Share one link so anyone can start a signing request from this template. They enter their
        name and email and get a signing link by email.
      </Intro>
      {body}
      {error ? (
        <Notice $tone="error" role="alert">
          {error}
        </Notice>
      ) : null}
      <SecretOnceSheet
        open={revealed !== null}
        onClose={() => setRevealed(null)}
        title="Your direct link"
        description="Copy it now. Only a fingerprint is kept, so the full link cannot be shown again. Rotate for a new one."
        secret={revealed ?? ''}
      />
    </Root>
  );
}
