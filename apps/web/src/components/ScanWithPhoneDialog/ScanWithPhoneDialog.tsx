import { useCallback, useEffect, useState, type JSX } from 'react';
import { CheckCircle2, Lock, RefreshCw, X } from 'lucide-react';
import QRCode from 'qrcode';
import {
  createScanSession,
  getScanSession,
  scanPhoneUrl,
  takeScanPdf,
} from '@/features/scan/scanApi';
import { Button } from '../Button';
import { DialogBackdrop } from '../DialogPrimitives';
import { Spinner } from '../Spinner';
import type { ScanWithPhoneDialogProps, ScanWithPhoneState } from './ScanWithPhoneDialog.types';
import {
  Card,
  Done,
  ErrorText,
  Header,
  Heading,
  Meta,
  QrOverlay,
  QrWrap,
  Status,
} from './ScanWithPhoneDialog.styles';

const TITLE_ID = 'scan-with-phone-title';
const POLL_MS = 2000;

function pagesLabel(n: number | null): string {
  if (n === null) return 'Pages received';
  return n === 1 ? '1 page received' : `${n} pages received`;
}

/**
 * L3 widget: "Scan with your phone" (design `Scan` desktop). Opens a scan
 * session, shows its QR, polls until the phone has sent the PDF, then offers
 * Continue. The code lives 10 minutes; after that "New code" opens another.
 */
export function ScanWithPhoneDialog(props: ScanWithPhoneDialogProps): JSX.Element | null {
  const { open, onClose, onContinue } = props;
  const [state, setState] = useState<ScanWithPhoneState>({ kind: 'creating' });
  const [round, setRound] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // One session per open (and per "New code").
  useEffect(() => {
    if (!open) return undefined;
    const ac = new AbortController();
    setState({ kind: 'creating' });
    setQrUrl(null);
    (async () => {
      try {
        const created = await createScanSession(ac.signal);
        const qrDataUrl = await QRCode.toDataURL(scanPhoneUrl(created.code), {
          margin: 1,
          width: 400,
          errorCorrectionLevel: 'M',
        }).catch(() => null);
        if (ac.signal.aborted) return;
        setQrUrl(qrDataUrl);
        setState({
          kind: 'qr',
          code: created.code,
          expiresAt: new Date(created.expires_at).getTime(),
        });
      } catch {
        if (!ac.signal.aborted) setState({ kind: 'error' });
      }
    })();
    return () => ac.abort();
  }, [open, round]);

  const code = state.kind === 'qr' ? state.code : null;
  const expiresAt = state.kind === 'qr' ? state.expiresAt : null;

  // Poll while the QR is up; expire locally at the deadline too.
  useEffect(() => {
    if (code === null || expiresAt === null) return undefined;
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      if (ac.signal.aborted) return;
      if (Date.now() >= expiresAt) {
        setState({ kind: 'expired' });
        return;
      }
      try {
        const view = await getScanSession(code, ac.signal);
        if (ac.signal.aborted) return;
        if (view.status === 'expired') {
          setState({ kind: 'expired' });
          return;
        }
        if (view.status === 'received') {
          setState({ kind: 'fetching', code, pageCount: view.page_count });
          return;
        }
      } catch {
        /* a blip: keep polling until the deadline */
      }
      if (!ac.signal.aborted) timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [code, expiresAt]);

  // Once the phone has sent it, take the PDF. Kept apart from the poll so
  // leaving the poll (state change) does not abort this request.
  const fetchingCode = state.kind === 'fetching' ? state.code : null;
  const fetchingPages = state.kind === 'fetching' ? state.pageCount : null;
  useEffect(() => {
    if (fetchingCode === null) return undefined;
    const ac = new AbortController();
    takeScanPdf(fetchingCode, ac.signal)
      .then((pdf) => {
        if (!ac.signal.aborted) setState({ kind: 'received', pdf, pageCount: fetchingPages });
      })
      .catch(() => {
        if (!ac.signal.aborted) setState({ kind: 'error' });
      });
    return () => ac.abort();
  }, [fetchingCode, fetchingPages]);

  const newCode = useCallback(() => setRound((n) => n + 1), []);

  if (!open) return null;

  const showQr = state.kind === 'qr' || state.kind === 'expired';

  return (
    <DialogBackdrop role="presentation">
      <Card role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
        <Header>
          <Heading id={TITLE_ID}>Scan with your phone</Heading>
          <Button
            iconOnly
            variant="ghost"
            size="sm"
            iconLeft={X}
            aria-label="Close"
            onClick={onClose}
          />
        </Header>

        {showQr ? (
          <QrWrap $dim={state.kind === 'expired'}>
            {qrUrl ? <img src={qrUrl} alt="QR code. Scan it with your phone camera." /> : null}
            {!qrUrl && state.kind === 'qr' ? (
              <Spinner size="lg" label="Making the QR code" />
            ) : null}
            {state.kind === 'expired' ? (
              <QrOverlay>
                <Button variant="secondary" iconLeft={RefreshCw} onClick={newCode}>
                  New code
                </Button>
              </QrOverlay>
            ) : null}
          </QrWrap>
        ) : null}

        {state.kind === 'creating' ? (
          <Status role="status">
            <Spinner size="lg" />
            <Meta>Making your code…</Meta>
          </Status>
        ) : null}

        {state.kind === 'qr' ? (
          <Status>
            <Meta>Open your camera and point it here</Meta>
            <Meta role="status">
              <Spinner size="sm" />
              Waiting for your phone…
            </Meta>
            <Meta>
              <Lock size={14} aria-hidden />
              Link works for 10 min
            </Meta>
          </Status>
        ) : null}

        {state.kind === 'expired' ? (
          <Status>
            <Meta role="status">This code expired.</Meta>
          </Status>
        ) : null}

        {state.kind === 'fetching' ? (
          <Status role="status">
            <Spinner size="lg" />
            <Meta>Getting your scan…</Meta>
          </Status>
        ) : null}

        {state.kind === 'received' ? (
          <Status>
            <Done aria-hidden>
              <CheckCircle2 size={28} />
            </Done>
            <Heading as="p" role="status">
              {pagesLabel(state.pageCount)}
            </Heading>
            <Button variant="primary" size="lg" onClick={() => onContinue(state.pdf)} autoFocus>
              Continue
            </Button>
          </Status>
        ) : null}

        {state.kind === 'error' ? (
          <Status>
            <ErrorText role="alert">{"Couldn't set up the scan. Try again."}</ErrorText>
            <Button variant="secondary" iconLeft={RefreshCw} onClick={newCode}>
              Try again
            </Button>
          </Status>
        ) : null}
      </Card>
    </DialogBackdrop>
  );
}
