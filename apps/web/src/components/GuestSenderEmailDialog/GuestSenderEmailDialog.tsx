import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react';
import { Button } from '../Button';
import {
  Backdrop,
  Card,
  Description,
  ErrorText,
  FieldRow,
  Footer,
  Form,
  TextInput,
  Title,
} from './GuestSenderEmailDialog.styles';
import type { GuestSenderEmailDialogProps } from './GuestSenderEmailDialog.types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_MAX = 254;
const NAME_MAX = 120;

/**
 * Captures the sender's identity in guest mode just before we POST
 * `/envelopes/:id/send`. The signed-in flow sources sender from the JWT
 * email claim, but anonymous Supabase sessions have no email — the API
 * accepts `{ sender_email, sender_name }` only when the JWT lacks
 * `email`, so we ask the user once here.
 *
 * Validation mirrors the backend `SendEnvelopeDto`:
 *   - email: required, RFC-loose regex, ≤ 254 chars
 *   - name: optional, ≤ 120 chars (whitespace-only treated as omitted)
 */
export function GuestSenderEmailDialog({
  open,
  onConfirm,
  onCancel,
  ...rest
}: GuestSenderEmailDialogProps): ReactElement | null {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const descId = useId();
  const emailInputRef = useRef<HTMLInputElement | null>(null);

  // Focus email input when the dialog opens; reset state when it closes.
  useEffect(() => {
    if (open) {
      emailInputRef.current?.focus();
      return;
    }
    setEmail('');
    setName('');
    setError(null);
  }, [open]);

  if (!open) return null;

  function handleSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail) {
      setError('Please enter your email so signers know who is asking.');
      return;
    }
    if (trimmedEmail.length > EMAIL_MAX) {
      setError(`Email is too long (max ${EMAIL_MAX} characters).`);
      return;
    }
    if (!EMAIL_RE.test(trimmedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (trimmedName.length > NAME_MAX) {
      setError(`Name is too long (max ${NAME_MAX} characters).`);
      return;
    }
    setError(null);
    onConfirm(trimmedEmail, trimmedName.length > 0 ? trimmedName : undefined);
  }

  return (
    <Backdrop role="presentation" onMouseDown={onCancel}>
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onMouseDown={(e) => e.stopPropagation()}
        {...rest}
      >
        <Title id={titleId}>Send as guest</Title>
        <Description id={descId}>
          You are sending without an account. We will include your email on the invite so signers
          know who is asking.
        </Description>
        <Form onSubmit={handleSubmit} noValidate>
          <FieldRow>
            Your email
            <TextInput
              ref={emailInputRef}
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={EMAIL_MAX}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error !== null}
            />
          </FieldRow>
          <FieldRow>
            Your name (optional)
            <TextInput
              type="text"
              autoComplete="name"
              maxLength={NAME_MAX}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FieldRow>
          {error !== null && <ErrorText role="alert">{error}</ErrorText>}
          <Footer>
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Continue
            </Button>
          </Footer>
        </Form>
      </Card>
    </Backdrop>
  );
}
