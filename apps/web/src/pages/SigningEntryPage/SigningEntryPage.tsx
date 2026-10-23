import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import {
  hintsFromError,
  linkStateFor,
  reportSignerEvent,
  stashLinkHints,
} from '@/features/signing';
import * as api from '@/features/signing/signingApi';
import { AccessCodeScreen } from '@/features/signing/accessCode';
import { StatusPage, TextLink } from '@/features/signing/ui/StatusPage';
import { useT } from '@/lib/i18n';

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

type EntryState = 'loading' | 'rate-limit' | 'generic';

interface ApiErrorLike extends Error {
  status?: number;
  code?: string;
  reason?: string;
  waiting_on?: string;
  sender_name?: string;
  signed_at?: string;
  short_code?: string;
}

/**
 * Public entry point for `/sign/:envelopeId?t=<token>`. Exchanges the token
 * for a session cookie via POST /sign/start, strips `?t=` from history, and
 * opens the document at `/fill`, where the consent bar waits. When the API
 * refuses the link it lands on the matching link-state screen
 * (`/sign/:id/link/:state`); a rate limit or a failure keeps its retry copy.
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
      navigate(`/sign/${envelopeId}/link/invalid`, { replace: true });
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
        // `fresh` makes the fill page ask for consent again for this session.
        // `navigate(..., { replace: true })` updates the URL AND scrubs
        // `?t=` from history in one step.
        navigate(`/sign/${envelopeId}/fill`, { replace: true, state: { fresh: true } });
      },
      (err) => {
        if (cancelled) return;
        // Drop the shared promise so a retry (manual reload) can re-POST.
        inflight.delete(key);
        // Strip `?t=` from the URL without notifying React Router — using
        // navigate() here would re-fire this effect with token=null and
        // override the error state below. A bare DOM-level replaceState
        // scrubs the token from history without triggering the router.
        if (typeof window !== 'undefined' && token !== null) {
          window.history.replaceState(null, '', `/sign/${envelopeId}`);
        }
        const apiError = err as ApiErrorLike;
        const link = linkStateFor(apiError);
        if (link !== null) {
          stashLinkHints(envelopeId, hintsFromError(apiError, token));
          navigate(`/sign/${envelopeId}/link/${link}`, { replace: true });
          return;
        }
        setState(apiError.status === 429 ? 'rate-limit' : 'generic');
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

  if (accessCodeEmail !== null) {
    return (
      <AccessCodeScreen
        emailMasked={accessCodeEmail}
        onVerified={() => {
          reportSignerEvent({ type: 'sign.session.started', envelope_id: envelopeId });
          navigate(`/sign/${envelopeId}/fill`, { replace: true, state: { fresh: true } });
        }}
      />
    );
  }

  if (state === 'loading') {
    return <StatusPage busy tone="neutral" icon={AlertCircle} title={t('signing.sign.opening')} />;
  }

  // Give support context without exposing the internal hostname.
  const mailtoHref =
    `mailto:support@seald.nromomentum.com` +
    `?subject=${encodeURIComponent(t('signing.entry.helpSubject', { envelopeId }))}`;
  const copy =
    state === 'rate-limit'
      ? { title: t('signing.entry.rateLimit.title'), body: t('signing.entry.rateLimit.body') }
      : { title: t('signing.entry.generic.title'), body: t('signing.entry.generic.body') };

  return (
    <StatusPage tone="bad" icon={AlertCircle} title={copy.title}>
      <span role="alert">{copy.body}</span>
      <Button variant="ghost" onClick={handleRetry}>
        {t('signing.entry.tryAgain')}
      </Button>
      <TextLink href={mailtoHref} rel="noreferrer">
        {t('signing.entry.contactSupport')}
      </TextLink>
    </StatusPage>
  );
}
