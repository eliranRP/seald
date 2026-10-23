import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ACCESS_CODE_PATTERN, ACCESS_CODE_POLICY } from 'shared';
import type { AccessCodePurpose, AccessCodeSendResponse } from 'shared';
import { Trans } from 'react-i18next';
import { Button } from '@/components/Button';
import { useT } from '@/lib/i18n';
import type { CommonKey } from '@/lib/i18n';
import { sendAccessCode } from './accessCodeApi';
import { describeAccessCodeError } from './accessCodeErrors';
import type { AccessCodeFailure } from './accessCodeErrors';
import {
  Actions,
  CodeInput,
  Email,
  ErrorBanner,
  Field,
  Hint,
  Label,
  Lead,
  Root,
  VisuallyHidden,
} from './AccessCodeForm.styles';

export interface AccessCodeFormProps {
  /** `access` opens the document; `action` re-checks right before signing. */
  readonly purpose: AccessCodePurpose;
  /** Masked mailbox the code goes to, e.g. `j***@example.com`. */
  readonly emailMasked: string;
  /**
   * Called with the six digits. Resolve when the code was accepted; throw the
   * API error otherwise (the form turns it into plain-language copy).
   */
  readonly onSubmitCode: (code: string) => Promise<void>;
  /** Label of the confirm button, e.g. "Continue" or "Sign and submit". */
  readonly submitLabel: string;
  /** Replaces the network call that emails a code (stories and tests). */
  readonly sendCode?: ((purpose: AccessCodePurpose) => Promise<AccessCodeSendResponse>) | undefined;
  /** The 401 case: the pending session is gone and the link must be opened again. */
  readonly onSessionLost?: (() => void) | undefined;
}

type Phase = 'idle' | 'sending' | 'ready' | 'needs-new';

const SEND_LABEL_KEYS: Record<Phase, CommonKey> = {
  idle: 'signing.accessCode.sendCode',
  sending: 'signing.accessCode.sendCode',
  ready: 'signing.accessCode.resendCode',
  'needs-new': 'signing.accessCode.sendNewCode',
};

/** Keeps digits only and caps at the code length, so a pasted "123 456" works. */
export function normalizeCodeInput(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, ACCESS_CODE_POLICY.length);
}

/**
 * Emailed one-time code entry (WP-11). Used on the signer entry screen
 * (`access`) and on the review step (`action`). Asks for a code to be
 * emailed, shows a countdown while a new one cannot be requested, and
 * explains each failure the API can return. The copy says "emailed
 * one-time code" throughout; it never says the signer's identity was
 * verified.
 */
export function AccessCodeForm({
  purpose,
  emailMasked,
  onSubmitCode,
  submitLabel,
  sendCode = sendAccessCode,
  onSessionLost,
}: AccessCodeFormProps) {
  const t = useT();
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<AccessCodeFailure | null>(null);
  const [busy, setBusy] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const secondsLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  // One job: tick once a second while a cooldown is running.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return undefined;
    setNow(Date.now());
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= cooldownUntil) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [cooldownUntil]);

  // Move to the field as soon as it appears.
  useEffect(() => {
    if (phase === 'ready') inputRef.current?.focus();
  }, [phase]);

  const startCooldown = useCallback((seconds: number) => {
    const t = Date.now();
    setNow(t);
    setCooldownUntil(t + seconds * 1000);
  }, []);

  const handleFailure = useCallback(
    (err: unknown): AccessCodeFailure => {
      const f = describeAccessCodeError(err, t);
      setFailure(f);
      if (f.retryAfterSeconds !== null) startCooldown(f.retryAfterSeconds);
      if (f.kind === 'session') onSessionLost?.();
      return f;
    },
    [onSessionLost, startCooldown, t],
  );

  const handleSend = useCallback(async () => {
    if (busy || secondsLeft > 0) return;
    setBusy(true);
    setFailure(null);
    setPhase((p) => (p === 'ready' ? p : 'sending'));
    try {
      const sent = await sendCode(purpose);
      startCooldown(sent.resend_after_seconds);
      setCode('');
      setPhase('ready');
      setAnnouncement(t('signing.accessCode.sent', { email: sent.email_masked }));
    } catch (err) {
      const f = handleFailure(err);
      // A recent code may still be live; let the signer type it.
      setPhase(f.kind === 'cooldown' ? 'ready' : 'idle');
    } finally {
      setBusy(false);
    }
  }, [busy, handleFailure, purpose, secondsLeft, sendCode, startCooldown, t]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (phase !== 'ready' || busy || !ACCESS_CODE_PATTERN.test(code)) return;
      setBusy(true);
      setFailure(null);
      setAnnouncement('');
      try {
        await onSubmitCode(code);
      } catch (err) {
        const f = handleFailure(err);
        setCode('');
        if (f.kind === 'locked' || f.kind === 'expired' || f.kind === 'not-requested') {
          setPhase('needs-new');
        } else {
          inputRef.current?.focus();
        }
        setBusy(false);
      }
    },
    [busy, code, handleFailure, onSubmitCode, phase],
  );

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setCode(normalizeCodeInput(event.target.value));
  };

  const showInput = phase === 'ready';
  const sendLabel = t(SEND_LABEL_KEYS[phase]);
  const waiting = secondsLeft > 0;
  const sendText = waiting
    ? t('signing.accessCode.inSeconds', { label: sendLabel, seconds: secondsLeft })
    : sendLabel;

  return (
    <Root
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
      aria-label={t('signing.accessCode.formLabel')}
    >
      <Lead>
        <Trans
          i18nKey={showInput ? 'signing.accessCode.leadSent' : 'signing.accessCode.leadWillSend'}
          values={{ email: emailMasked }}
          components={{ email: <Email /> }}
        />{' '}
        {purpose === 'action'
          ? t('signing.accessCode.purposeAction')
          : t('signing.accessCode.purposeAccess')}
      </Lead>

      {showInput ? (
        <Field>
          <Label htmlFor={inputId}>{t('signing.accessCode.inputLabel')}</Label>
          <CodeInput
            id={inputId}
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            spellCheck={false}
            value={code}
            onChange={onChange}
            disabled={busy}
            $invalid={failure?.kind === 'invalid'}
            aria-invalid={failure?.kind === 'invalid' ? true : undefined}
            aria-describedby={failure ? `${hintId} ${errorId}` : hintId}
          />
          <Hint id={hintId}>
            {t('signing.accessCode.hint', {
              digits: ACCESS_CODE_POLICY.length,
              minutes: ACCESS_CODE_POLICY.ttlSeconds / 60,
            })}
          </Hint>
        </Field>
      ) : null}

      {failure ? (
        <ErrorBanner id={errorId} role="alert">
          {failure.message}
        </ErrorBanner>
      ) : null}

      <Actions>
        {showInput ? (
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={busy}
            disabled={busy || !ACCESS_CODE_PATTERN.test(code)}
          >
            {submitLabel}
          </Button>
        ) : null}
        <Button
          type="button"
          variant={showInput ? 'secondary' : 'primary'}
          size="lg"
          fullWidth
          disabled={busy || waiting}
          onClick={() => void handleSend()}
        >
          {sendText}
        </Button>
      </Actions>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </Root>
  );
}
