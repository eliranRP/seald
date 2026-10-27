import { useEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicDirectLink } from 'shared';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Spinner } from '@/components/shared/Spinner';
import { claimDirectLink, fetchPublicDirectLink } from '@/features/directLinks/directLinksApi';
import { PublicHeader } from '@/layout/PublicHeader';
import { Body, Card, Form, FormError, Intro, Page, Screen, Title } from './DirectLinkPage.styles';

type View =
  | { readonly kind: 'loading' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'error' }
  | { readonly kind: 'form'; readonly link: PublicDirectLink }
  | { readonly kind: 'sent'; readonly link: PublicDirectLink; readonly email: string };

interface HttpErrorLike extends Error {
  status?: number;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FieldName = 'name' | 'email';
type FieldErrors = { readonly [K in FieldName]?: string | undefined };

/** Each message names the fix (forms § 6). */
function validateField(field: FieldName, raw: string): string | undefined {
  const value = raw.trim();
  if (field === 'name') return value.length === 0 ? 'Enter your name.' : undefined;
  if (value.length === 0) return 'Enter your email address.';
  return EMAIL_PATTERN.test(value)
    ? undefined
    : 'Enter a full email address, like name@example.com.';
}

function claimErrorMessage(err: unknown): string {
  const status = (err as HttpErrorLike).status;
  if (status === 429) return 'Too many requests. Please wait a while and try again.';
  if (status === 400) return 'Check your name and email address and try again.';
  return 'We could not start this just now. Please try again.';
}

/** The shared logo bar, so a visitor can tell which service is asking. */
function Frame({ children }: { readonly children: ReactNode }) {
  return (
    <Screen>
      <PublicHeader />
      <Page>{children}</Page>
    </Screen>
  );
}

/**
 * Public `/d/:token` page for a template direct link (WP-37). It shows the
 * template title and who is asking, takes a name and an email, and then asks
 * the visitor to check their inbox: the signing link goes to that address,
 * so opening it proves they control it. Nothing is prefilled and nothing
 * else about the template, its other signers or the sender is shown. Every
 * unusable link looks the same ("not available"), whether it is off, rotated
 * away or never existed.
 */
export function DirectLinkPage() {
  const { token = '' } = useParams<{ readonly token: string }>();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Per-field errors: shown when a field is left (blur) or on submit, then
  // re-checked live on every keystroke so they clear the moment the value is
  // right (forms § 4).
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const touch = (field: FieldName, value: string): void => {
    setFieldErrors((prev) => ({ ...prev, [field]: validateField(field, value) }));
  };
  const change = (field: FieldName, value: string): void => {
    if (field === 'name') setName(value);
    else setEmail(value);
    // Live only once the field has shown an error.
    if (fieldErrors[field] !== undefined) touch(field, value);
  };

  useEffect(() => {
    let cancelled = false;
    setView({ kind: 'loading' });
    fetchPublicDirectLink(token).then(
      (link) => {
        if (!cancelled) setView({ kind: 'form', link });
      },
      (err: unknown) => {
        if (cancelled) return;
        setView({ kind: (err as HttpErrorLike).status === 404 ? 'unavailable' : 'error' });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt]);

  // The token is the credential: keep it out of referrers. (The SPA shell
  // already says noindex, nofollow.)
  useEffect(() => {
    const referrer = document.createElement('meta');
    referrer.name = 'referrer';
    referrer.content = 'no-referrer';
    document.head.append(referrer);
    return () => {
      referrer.remove();
    };
  }, []);

  async function onSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (view.kind !== 'form' || submitting) return;
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const errors: FieldErrors = {
      name: validateField('name', name),
      email: validateField('email', email),
    };
    setFieldErrors(errors);
    if (errors.name !== undefined || errors.email !== undefined) {
      // Mark every blocker, then take the visitor to the first one.
      (errors.name !== undefined ? nameRef : emailRef).current?.focus();
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await claimDirectLink(token, { name: cleanName, email: cleanEmail });
      setView({ kind: 'sent', link: view.link, email: cleanEmail });
    } catch (err) {
      const status = (err as HttpErrorLike).status;
      if (status === 404) setView({ kind: 'unavailable' });
      else setError(claimErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (view.kind === 'loading') {
    return (
      <Frame>
        <Card role="status" aria-live="polite">
          <Spinner />
          <Body>Opening this link…</Body>
        </Card>
      </Frame>
    );
  }

  if (view.kind === 'unavailable') {
    return (
      <Frame>
        <Card>
          <Intro>
            <Title>This link is not available</Title>
            <Body>
              It may have been turned off or replaced. Ask the person who shared it for a new link.
            </Body>
          </Intro>
        </Card>
      </Frame>
    );
  }

  if (view.kind === 'error') {
    return (
      <Frame>
        <Card>
          <Intro>
            <Title>Something went wrong</Title>
            <Body role="alert">
              We could not open this link right now. Check your connection, then try again.
            </Body>
          </Intro>
          <Button variant="primary" fullWidth onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </Card>
      </Frame>
    );
  }

  if (view.kind === 'sent') {
    return (
      <Frame>
        <Card role="status" aria-live="polite">
          <Intro>
            <Title>Check your email</Title>
            <Body>
              If this link can start a signing request for {view.email}, we have sent a signing link
              there. Open it to continue. You can close this page.
            </Body>
          </Intro>
        </Card>
      </Frame>
    );
  }

  return (
    <Frame>
      <Card>
        <Intro>
          <Title>{view.link.template_title}</Title>
          <Body>
            {view.link.sender_name} asks you to sign this document. Enter your name and email and we
            will send you a link to review and sign it.
          </Body>
        </Intro>
        <Form onSubmit={(e) => void onSubmit(e)} noValidate>
          <TextField
            ref={nameRef}
            label="Your name"
            value={name}
            autoComplete="name"
            maxLength={120}
            required
            error={fieldErrors.name}
            onChange={(v) => change('name', v)}
            onBlur={() => touch('name', name)}
          />
          <TextField
            ref={emailRef}
            label="Your email"
            type="email"
            value={email}
            autoComplete="email"
            maxLength={254}
            required
            error={fieldErrors.email}
            onChange={(v) => change('email', v)}
            onBlur={() => touch('email', email)}
          />
          {error ? <FormError role="alert">{error}</FormError> : null}
          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            Email me the signing link
          </Button>
        </Form>
      </Card>
    </Frame>
  );
}
