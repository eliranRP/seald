import { useCallback, useEffect, useState, type JSX } from 'react';
import { CheckCircle2, Clock, Link2Off, WifiOff } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/Button';
import { ScanCapture } from '@/components/ScanCapture';
import { ScanWithPhoneDialog } from '@/components/ScanWithPhoneDialog';
import { Spinner } from '@/components/Spinner';
import { StatePage } from '@/components/StatePage';
import { getPhoneScanSession, postScanPdf } from '@/features/scan/scanApi';
import { readIsMobileViewport, useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import type { ApiError } from '@/lib/api/apiClient';
import type { PhoneScanState, ScanPageProps } from './ScanPage.types';
import { Plain, Wait } from './ScanPage.styles';

function statusOf(err: unknown): number | undefined {
  return (err as Partial<ApiError> | null)?.status;
}

/**
 * `/scan` and `/scan/:code` (redesign v2, Scan boards).
 *
 * - `/scan/:code` is the phone side: no sign-in, the code is the credential.
 *   It opens the camera, builds one PDF and posts it once.
 * - `/scan` is the signed-in owner. On a phone they scan straight into the
 *   upload flow; on a computer it shows the QR dialog.
 */
export function ScanPage(props: ScanPageProps): JSX.Element {
  const params = useParams<{ code: string }>();
  const code = props.code ?? params.code;
  return code ? <PhoneScan code={code} /> : <OwnerScan />;
}

function PhoneScan({ code }: { readonly code: string }): JSX.Element {
  const [state, setState] = useState<PhoneScanState>('checking');
  const [round, setRound] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    setState('checking');
    getPhoneScanSession(code, ac.signal)
      .then((view) => {
        if (ac.signal.aborted) return;
        if (view.status === 'expired') setState('expired');
        else setState(view.status === 'received' ? 'used' : 'ready');
      })
      .catch((err: unknown) => {
        if (ac.signal.aborted) return;
        const status = statusOf(err);
        if (status === 404) setState('invalid');
        else setState('offline');
      });
    return () => ac.abort();
  }, [code, round]);

  const send = useCallback(
    async (pdf: File): Promise<void> => {
      try {
        await postScanPdf(code, pdf);
      } catch (err) {
        const status = statusOf(err);
        if (status === 410) setState('expired');
        else if (status === 409) setState('used');
        else if (status === 404) setState('invalid');
        throw err;
      }
      setState('sent');
    },
    [code],
  );

  switch (state) {
    case 'checking':
      return (
        <Wait>
          <Spinner size="lg" label="Checking your link" />
        </Wait>
      );
    case 'ready':
      return <ScanCapture onComplete={send} />;
    case 'sent':
      return (
        <StatePage
          icon={CheckCircle2}
          tone="ok"
          title="Sent to your computer"
          description="Your scan is on its way. You can close this tab."
        />
      );
    case 'expired':
      return (
        <StatePage
          icon={Clock}
          tone="warn"
          title="This link expired"
          description="Show a new code on your computer and scan it again."
        />
      );
    case 'used':
      return (
        <StatePage
          icon={CheckCircle2}
          tone="neutral"
          title="Already sent"
          description="This link was used. Show a new code on your computer to scan again."
        />
      );
    case 'offline':
      return (
        <StatePage
          icon={WifiOff}
          tone="warn"
          title="Can't reach Seald"
          description="Check your connection and try again."
        >
          <Button variant="primary" onClick={() => setRound((n) => n + 1)}>
            Try again
          </Button>
        </StatePage>
      );
    default:
      return (
        <StatePage
          icon={Link2Off}
          tone="bad"
          title="This link isn't valid"
          description="Show a new code on your computer and scan it again."
        />
      );
  }
}

function OwnerScan(): JSX.Element {
  const navigate = useNavigate();
  // The sync read avoids a first paint of the QR dialog (and a wasted session) on a phone.
  const mobile = useIsMobileViewport() || readIsMobileViewport();

  const toPrepare = useCallback(
    (pdf: File): void => {
      navigate('/document/new', { state: { pendingFile: pdf } });
    },
    [navigate],
  );
  const back = useCallback((): void => {
    navigate('/document/new');
  }, [navigate]);

  if (mobile) {
    return (
      <ScanCapture
        onComplete={async (pdf) => {
          toPrepare(pdf);
        }}
        onClose={back}
      />
    );
  }
  return (
    <Plain>
      <ScanWithPhoneDialog open onClose={back} onContinue={toPrepare} />
    </Plain>
  );
}
