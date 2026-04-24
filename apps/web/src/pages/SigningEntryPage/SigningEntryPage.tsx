import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { reportSignerEvent, useStartSessionMutation } from '../../features/signing';
import { Body, Card, MailtoLink, Page, Spinner, Title } from './SigningEntryPage.styles';

type EntryState = 'loading' | 'invalid' | 'burned' | 'not-found' | 'rate-limit' | 'generic';

interface ApiErrorLike extends Error {
  status?: number;
}

function mapError(err: ApiErrorLike): EntryState {
  if (err.status === 400) return 'invalid';
  if (err.status === 401 || err.status === 410) return 'burned';
  if (err.status === 404) return 'not-found';
  if (err.status === 429) return 'rate-limit';
  return 'generic';
}

const COPY: Record<EntryState, { readonly title: string; readonly body: string }> = {
  loading: {
    title: 'Opening your document…',
    body: 'One moment while we set up your signing session.',
  },
  invalid: {
    title: 'This signing link is invalid',
    body: 'The link appears to be malformed. Ask the sender to send a fresh link to your email.',
  },
  burned: {
    title: 'This signing link has already been used',
    body: "If you still need to sign, ask the sender to resend the invite — we'll issue a new link.",
  },
  'not-found': {
    title: "We couldn't find this signing request",
    body: 'Double-check the link in your email, or ask the sender to resend it.',
  },
  'rate-limit': {
    title: 'Too many attempts',
    body: 'Please wait a moment and try the link again.',
  },
  generic: {
    title: 'Something went wrong',
    body: "We couldn't open this document right now. Try again, or ask the sender for a fresh link.",
  },
};

/**
 * Public entry point for `/sign/:envelopeId?t=<token>`. Exchanges the token
 * for a session cookie via POST /sign/start, strips `?t=` from history, and
 * routes the user to `/prep` (or `/fill` when T&C already accepted).
 *
 * The token handshake runs exactly once per mount (a useRef guard prevents
 * React StrictMode's double-invoke from double-spending the token).
 */
export function SigningEntryPage() {
  const params = useParams<{ readonly envelopeId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const startMut = useStartSessionMutation();
  const ranRef = useRef(false);
  const envelopeId = params.envelopeId ?? '';
  const token = search.get('t');

  const [state, setState] = useState<EntryState>('loading');

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    reportSignerEvent({
      type: 'sign.link.opened',
      envelope_id: envelopeId,
      has_token: Boolean(token),
    });

    if (!envelopeId || !token) {
      setState('invalid');
      return;
    }

    startMut.mutate(
      { envelope_id: envelopeId, token },
      {
        onSuccess: (result) => {
          // Scrub ?t= so reload / back / copied URL can't replay a burned token.
          window.history.replaceState(null, '', `/sign/${envelopeId}/prep`);
          const next = result.requires_tc_accept
            ? `/sign/${envelopeId}/prep`
            : `/sign/${envelopeId}/fill`;
          navigate(next, { replace: true });
        },
        onError: (err) => {
          window.history.replaceState(null, '', `/sign/${envelopeId}`);
          setState(mapError(err as ApiErrorLike));
        },
      },
    );
    // Intentionally exclude mutation object from deps — the ref guard ensures
    // this runs exactly once even if React re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envelopeId, token]);

  const copy = COPY[state];

  return (
    <Page>
      <Card>
        {state === 'loading' ? (
          <div style={{ display: 'grid', gap: 20, placeItems: 'center' }}>
            <Spinner aria-hidden="true" />
            <Title>{copy.title}</Title>
            <Body>{copy.body}</Body>
          </div>
        ) : (
          <>
            <Title>{copy.title}</Title>
            <Body>{copy.body}</Body>
            <MailtoLink href="mailto:support@seald.app" rel="noreferrer">
              Contact support
            </MailtoLink>
          </>
        )}
      </Card>
    </Page>
  );
}
