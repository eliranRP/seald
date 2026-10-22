import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { PublicDirectLink } from 'shared';
import { Button } from '@/components/Button';
import { TextField } from '@/components/TextField';
import { Spinner } from '@/components/shared/Spinner';
import { claimDirectLink, fetchPublicDirectLink } from '@/features/directLinks/directLinksApi';
import { Body, Card, Form, FormError, Page, Title } from './DirectLinkPage.styles';

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

function claimErrorMessage(err: unknown): string {
  const status = (err as HttpErrorLike).status;
  if (status === 429) return 'Too many requests. Please wait a while and try again.';
  if (status === 400) return 'Check your name and email address and try again.';
  return 'We could not start this just now. Please try again.';
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
  const [submitting, setSubmitting] = useState(false);

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
  }, [token]);

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
    if (cleanName.length === 0) {
      setError('Enter your name.');
      return;
    }
    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setError('Enter a valid email address.');
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
      <Page>
        <Card role="status" aria-live="polite">
          <Spinner />
          <Body>Opening this link…</Body>
        </Card>
      </Page>
    );
  }

  if (view.kind === 'unavailable' || view.kind === 'error') {
    return (
      <Page>
        <Card>
          <Title>
            {view.kind === 'unavailable' ? 'This link is not available' : 'Something went wrong'}
          </Title>
          <Body>
            {view.kind === 'unavailable'
              ? 'It may have been turned off or replaced. Ask the person who shared it for a new link.'
              : 'We could not open this link right now. Please try again in a moment.'}
          </Body>
        </Card>
      </Page>
    );
  }

  if (view.kind === 'sent') {
    return (
      <Page>
        <Card role="status" aria-live="polite">
          <Title>Check your email</Title>
          <Body>
            If this link can start a signing request for {view.email}, we have sent a signing link
            there. Open it to continue. You can close this page.
          </Body>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card>
        <Title>{view.link.template_title}</Title>
        <Body>
          {view.link.sender_name} asks you to sign this document. Enter your name and email and we
          will send you a link to review and sign it.
        </Body>
        <Form onSubmit={(e) => void onSubmit(e)} noValidate>
          <TextField
            label="Your name"
            value={name}
            autoComplete="name"
            maxLength={120}
            required
            onChange={(v) => setName(v)}
          />
          <TextField
            label="Your email"
            type="email"
            value={email}
            autoComplete="email"
            maxLength={254}
            required
            onChange={(v) => setEmail(v)}
          />
          {error ? <FormError role="alert">{error}</FormError> : null}
          <Button type="submit" variant="primary" fullWidth loading={submitting}>
            Email me the signing link
          </Button>
        </Form>
      </Card>
    </Page>
  );
}
