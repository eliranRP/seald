import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { reportSignerEvent } from '@/features/signing';
import { isNotYourTurnError, NotYourTurn } from '@/features/signers/signingOrder';
import * as api from '@/features/signing/signingApi';
import { AccessCodeScreen } from '@/features/signing/accessCode';
import { useT } from '@/lib/i18n';
import type { CommonKey } from '@/lib/i18n';
import {
  Body,
  Card,
  MailtoLink,
  Page,
  Spinner,
  Title,
  TryAgainBtn,
} from './SigningEntryPage.styles';

/**
 * Module-level map of (envelope_id, token) → in-flight Promise.
 *
 * Why not `useRef` or `useMutation`:
 *   - React 18 StrictMode DEV full-remounts components, which resets
 *     `useRef`. A per-instance guard therefore fires the one-shot token
 *     handshake twice and burns the token on the first POST before the
 *     second can complete, leaving the UI stuck with no onSuccess
 *     callback firing.
 *   - React Query's `useMutation` has its own per-hook observer state
 *     which we were unable to keep consistent across StrictMode's
 *     unmount/remount cycle.
 *
 * A module-level map dedupes across every remount in the same browser
 * session: the second invocation attaches to the FIRST invocation's
 * in-flight promise instead of firing a new POST. A hard refresh clears
 * it, which is the desired behaviour (a refresh with the same `?t=` is a
 * legitimate replay attempt that the API will reject with 401).
 */
const inflight = new Map<string, Promise<api.StartSessionResult>>();

/**
 * Test-only escape hatch to drain the module-level dedupe cache between
 * tests. The cache is a deliberate runtime feature (it survives StrictMode
 * remounts) but in test environments it leaks between cases that share the
 * same envelope_id + token, so call this in `beforeEach` to ensure each
 * test starts with a clean slate.
 */
export function resetInflightForTests(): void {
  inflight.clear();
}

type EntryState =
  | 'loading'
  | 'invalid'
  | 'burned'
  | 'not-found'
  | 'rate-limit'
  | 'not-your-turn'
  | 'generic';

interface ApiErrorLike extends Error {
  status?: number;
}

function mapError(err: ApiErrorLike): EntryState {
  // WP-06: 409 not_your_turn is a wait, not a used link.
  if (isNotYourTurnError(err)) return 'not-your-turn';
  if (err.status === 400) return 'invalid';
  // 401 invalid_token, 410 envelope_terminal, 409 already_signed/declined
  // (from assertStillSignable). All four mean "this link won't sign anything"
  // from the user's perspective, so the same copy ("already been used") is
  // the most useful message.
  if (err.status === 401 || err.status === 409 || err.status === 410) return 'burned';
  if (err.status === 404) return 'not-found';
  if (err.status === 429) return 'rate-limit';
  return 'generic';
}

/** Catalog keys for each entry state's title and body (`signing.entry.*`). */
const COPY_KEYS: Record<EntryState, { readonly title: CommonKey; readonly body: CommonKey }> = {
  loading: { title: 'signing.entry.loading.title', body: 'signing.entry.loading.body' },
  invalid: { title: 'signing.entry.invalid.title', body: 'signing.entry.invalid.body' },
  burned: { title: 'signing.entry.burned.title', body: 'signing.entry.burned.body' },
  'not-found': { title: 'signing.entry.notFound.title', body: 'signing.entry.notFound.body' },
  'not-your-turn': {
    title: 'signing.entry.notYourTurn.title',
    body: 'signing.entry.notYourTurn.body',
  },
  'rate-limit': { title: 'signing.entry.rateLimit.title', body: 'signing.entry.rateLimit.body' },
  generic: { title: 'signing.entry.generic.title', body: 'signing.entry.generic.body' },
};

/**
 * Public entry point for `/sign/:envelopeId?t=<token>`. Exchanges the token
 * for a session cookie via POST /sign/start, strips `?t=` from history, and
 * routes the user to `/prep` (or `/fill` when T&C already accepted).
 *
 * Implementation note: we bypass React Query for this one call because
 * StrictMode's unmount/remount cycle was losing the mutation's resolution
 * callbacks mid-flight. A plain Promise kept in module scope (see
 * `inflight` above) is robust to remounts AND dedupes automatically.
 */
export function SigningEntryPage() {
  const t = useT();
  const params = useParams<{ readonly envelopeId: string }>();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const envelopeId = params.envelopeId ?? '';
  const token = search.get('t');

  const [state, setState] = useState<EntryState>('loading');
  // WP-10/11: the sender asked for an emailed one-time code. Set only when
  // `/sign/start` answers `access_code_required`, which it never does while
  // the `signerAccessAuth` flag is off.
  const [accessCodeEmail, setAccessCodeEmail] = useState<string | null>(null);
  // Item 1 — `retryCounter` is appended to the effect dependency array so a
  // user-initiated "Try again" click re-runs the startSession handshake
  // without a full page reload (the module-level `inflight` cache for the
  // failed key is cleared in the rejection branch already).
  const [retryCounter, setRetryCounter] = useState(0);

  useEffect(() => {
    reportSignerEvent({
      type: 'sign.link.opened',
      envelope_id: envelopeId,
      has_token: Boolean(token),
    });

    if (!envelopeId || !token) {
      setState('invalid');
      return undefined;
    }

    // `cancelled` is flipped on unmount so an in-flight resolution
    // doesn't call `navigate` or `setState` after the component is gone.
    // (The underlying POST still completes — deliberately: the token has
    // already been consumed server-side and we want the session cookie
    // set so a subsequent remount's /sign/me succeeds.)
    let cancelled = false;

    const key = `${envelopeId}:${token}`;
    let promise = inflight.get(key);
    if (!promise) {
      promise = api.startSession({ envelope_id: envelopeId, token });
      inflight.set(key, promise);
    }

    promise.then(
      (result) => {
        if (cancelled) return;
        if (api.isAccessCodeRequired(result)) {
          // No session yet. Scrub `?t=` like the error branch does (a bare
          // replaceState, so the router does not re-run this effect).
          window.history.replaceState(null, '', `/sign/${envelopeId}`);
          setAccessCodeEmail(result.email_masked);
          return;
        }
        reportSignerEvent({ type: 'sign.session.started', envelope_id: envelopeId });
        const next = result.requires_tc_accept
          ? `/sign/${envelopeId}/prep`
          : `/sign/${envelopeId}/fill`;
        // `navigate(..., { replace: true })` updates the URL AND scrubs
        // `?t=` from history in one step.
        navigate(next, { replace: true });
      },
      (err) => {
        if (cancelled) return;
        // Drop the shared promise so a retry (manual reload) can re-POST.
        inflight.delete(key);
        // Strip `?t=` from the URL without notifying React Router — using
        // navigate() here would re-fire this effect with token=null and
        // override the error state below with 'invalid'. A bare DOM-level
        // replaceState scrubs the token from history without triggering
        // the router.
        if (typeof window !== 'undefined' && token !== null) {
          window.history.replaceState(null, '', `/sign/${envelopeId}`);
        }
        setState(mapError(err as ApiErrorLike));
      },
    );

    return () => {
      cancelled = true;
    };
  }, [envelopeId, token, navigate, retryCounter]);

  const handleRetry = useCallback(() => {
    setState('loading');
    setRetryCounter((n) => n + 1);
  }, []);

  if (state === 'not-your-turn') return <NotYourTurn />;

  if (accessCodeEmail !== null) {
    return (
      <AccessCodeScreen
        emailMasked={accessCodeEmail}
        onVerified={(result) => {
          reportSignerEvent({ type: 'sign.session.started', envelope_id: envelopeId });
          navigate(
            result.requires_tc_accept ? `/sign/${envelopeId}/prep` : `/sign/${envelopeId}/fill`,
            { replace: true },
          );
        }}
      />
    );
  }

  const copy = { title: t(COPY_KEYS[state].title), body: t(COPY_KEYS[state].body) };
  // Item 1 — only the two recoverable error states get a retry CTA. The
  // burned/invalid/not-found terminals are intentionally one-shot and the
  // retry would just immediately re-fail; mailto stays as the path forward.
  const canRetry = state === 'rate-limit' || state === 'generic';
  // Item 4 — give support context without exposing the internal hostname.
  // `encodeURIComponent` keeps the subject opaque-but-readable in clients
  // that decode it for display.
  const mailtoHref =
    `mailto:support@seald.nromomentum.com` +
    `?subject=${encodeURIComponent(t('signing.entry.helpSubject', { envelopeId }))}`;

  // Item 2 — wrap loading + terminal-error branches in landmarks that the
  // accessibility tree exposes. `role="status"` with `aria-live="polite"`
  // announces the loading copy without interrupting; terminal errors get
  // `role="alert"` (implicit `aria-live="assertive"`) on the Card.
  return (
    <Page>
      {state === 'loading' ? (
        <Card role="status" aria-live="polite">
          <div style={{ display: 'grid', gap: 20, placeItems: 'center' }}>
            <Spinner $size={24} aria-hidden="true" />
            <Title>{copy.title}</Title>
            <Body>{copy.body}</Body>
          </div>
        </Card>
      ) : (
        <Card role="alert">
          <Title>{copy.title}</Title>
          <Body>{copy.body}</Body>
          {canRetry ? (
            <TryAgainBtn type="button" onClick={handleRetry}>
              {t('signing.entry.tryAgain')}
            </TryAgainBtn>
          ) : null}
          <MailtoLink href={mailtoHref} rel="noreferrer">
            {t('signing.entry.contactSupport')}
          </MailtoLink>
        </Card>
      )}
    </Page>
  );
}
