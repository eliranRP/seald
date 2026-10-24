import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { CheckChip } from '@/components/CheckChip';
import { Icon } from '@/components/Icon';
import { Skeleton } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { useVerifyEnvelope, VERIFY_KEY } from '@/features/verify';
import type { VerifyResponse, VerifySigner } from '@/features/verify';
import { copyText } from './copyText';
import { EntryPanel } from './EntryPanel';
import { FileCompare } from './FileCompare';
import type { MatchedFile } from './FileCompare';
import { TechDetails } from './TechDetails';
import { deriveVerdict } from './verdict';
import {
  AvatarSlot,
  Avatars,
  ChipsRow,
  Column,
  DocTitle,
  EntryFooter,
  ErrorPanel,
  Footer,
  LoadingNote,
  LoadingStack,
  Logo,
  LogoMark,
  LogoWord,
  Meta,
  Page,
  SkeletonChips,
  Spacer,
  Stage,
  TopBar,
  Verdict,
  VerdictIcon,
  VerdictWord,
} from './VerifyPage.styles';

const SHARE_URL_PREFIX = 'https://seald.nromomentum.com/verify/';
const TOAST_MS = 2000;

function signerTone(status: VerifySigner['status']): 'emerald' | 'danger' | 'slate' {
  if (status === 'completed') return 'emerald';
  if (status === 'declined') return 'danger';
  return 'slate';
}

function isMatchedFile(value: unknown): value is MatchedFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { name?: unknown; size?: unknown };
  return typeof v.name === 'string' && typeof v.size === 'number';
}

interface ShellProps {
  readonly children: React.ReactNode;
  readonly shareCode?: string | undefined;
  readonly onCopyLink?: (() => void) | undefined;
}

/** Public header (`.sign-top`) + centred column. No session, no app nav. */
function Shell({ children, shareCode, onCopyLink }: ShellProps) {
  return (
    <Page>
      <TopBar>
        <Logo>
          <LogoMark aria-hidden>S</LogoMark>
          <LogoWord>Seald</LogoWord>
        </Logo>
        {shareCode && onCopyLink ? (
          <>
            <Spacer />
            <Button variant="ghost" size="sm" iconLeft={Copy} onClick={onCopyLink}>
              Copy link
            </Button>
          </>
        ) : null}
      </TopBar>
      <Stage>
        <Column>{children}</Column>
      </Stage>
    </Page>
  );
}

interface VerifyContentProps {
  readonly data: VerifyResponse;
  readonly matchedFile: MatchedFile | undefined;
}

function VerifyContent({ data, matchedFile }: VerifyContentProps) {
  const verdict = useMemo(() => deriveVerdict(data), [data]);
  const [toast, setToast] = useState<string | null>(null);

  const copy = useCallback(async (text: string, message: string) => {
    if (await copyText(text)) setToast(message);
  }, []);
  const closeToast = useCallback(() => setToast(null), []);

  const sealedHashes = useMemo(() => {
    const out = new Set<string>();
    if (data.envelope.sealed_sha256) out.add(data.envelope.sealed_sha256.toLowerCase());
    for (const doc of data.documents ?? []) {
      if (doc.sealed_sha256) out.add(doc.sealed_sha256.toLowerCase());
    }
    return [...out];
  }, [data]);

  return (
    <Shell
      shareCode={data.envelope.short_code}
      onCopyLink={() => void copy(`${SHARE_URL_PREFIX}${data.envelope.short_code}`, 'Link copied')}
    >
      <Verdict>
        <VerdictIcon $tone={verdict.tone}>
          <Icon icon={verdict.icon} size={48} />
        </VerdictIcon>
        <VerdictWord>{verdict.word}</VerdictWord>
        <DocTitle title={data.envelope.title}>{data.envelope.title}</DocTitle>
        <Meta>{verdict.meta}</Meta>
        <Avatars aria-label="Signers">
          {data.signers.map((s) => (
            <AvatarSlot key={s.id} $faded={s.status !== 'completed' && s.status !== 'declined'}>
              <Avatar name={s.name} size={40} tone={signerTone(s.status)} title={s.name} />
            </AvatarSlot>
          ))}
        </Avatars>
      </Verdict>

      <ChipsRow aria-label="Checks">
        {verdict.chips.map((chip, i) => (
          <CheckChip key={chip.label} state={chip.state} index={i}>
            {chip.label}
          </CheckChip>
        ))}
      </ChipsRow>

      {verdict.sealed && sealedHashes.length > 0 ? (
        <FileCompare sealedHashes={sealedHashes} initialMatch={matchedFile} />
      ) : null}

      <TechDetails
        data={data}
        sealed={verdict.sealed}
        tampered={verdict.tampered}
        onCopy={(text) => void copy(text, 'Copied')}
      />

      <Footer>
        <Icon icon={ShieldCheck} size={14} />
        Verification by Seald
      </Footer>

      {toast ? <Toast title={toast} duration={TOAST_MS} onClose={closeToast} /> : null}
    </Shell>
  );
}

interface VerifyLoadingProps {
  readonly onRetry: () => void;
}

// Two timers, each isolated in its own effect (rule 4.4): 5s softens the
// copy to "Still working…", 15s offers a manual Retry.
const STILL_WORKING_DELAY_MS = 5_000;
const RETRY_OFFER_DELAY_MS = 15_000;
// Chip placeholder widths from the boards (Verify loading, desktop / mobile).
const DESKTOP_CHIP_WIDTHS = [150, 150, 150, 150] as const;
const MOBILE_CHIP_WIDTHS = [120, 110, 130, 96] as const;

function VerifyLoading({ onRetry }: VerifyLoadingProps) {
  const isMobile = useIsMobileViewport();
  const [stillWorking, setStillWorking] = useState(false);
  const [retryOffered, setRetryOffered] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setStillWorking(true), STILL_WORKING_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => setRetryOffered(true), RETRY_OFFER_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <Shell>
      <LoadingStack aria-busy aria-live="polite" aria-label="Loading verification">
        <Skeleton variant="circle" width={96} height={96} aria-hidden />
        <Skeleton
          variant="text"
          width={isMobile ? '70%' : 320}
          height={isMobile ? 22 : 36}
          aria-hidden
        />
        <Skeleton variant="text" width={isMobile ? '45%' : 220} height={14} aria-hidden />
        <SkeletonChips>
          {(isMobile ? MOBILE_CHIP_WIDTHS : DESKTOP_CHIP_WIDTHS).map((w, i) => (
            <Skeleton key={i} variant="text" width={w} height={32} aria-hidden />
          ))}
        </SkeletonChips>
        {stillWorking ? <LoadingNote>Still working…</LoadingNote> : null}
        {retryOffered ? (
          <Button variant="secondary" size="sm" iconLeft={RefreshCcw} onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </LoadingStack>
    </Shell>
  );
}

interface VerifyErrorProps {
  readonly message?: string | undefined;
  readonly onRetry: () => void;
}

function VerifyError({ message, onRetry }: VerifyErrorProps) {
  return (
    <Shell>
      <ErrorPanel role="alert">
        <h2>Something went wrong</h2>
        <p>{message || 'Try again in a moment. If this keeps happening, contact the sender.'}</p>
        <Button variant="secondary" size="sm" iconLeft={RefreshCcw} onClick={onRetry}>
          Try again
        </Button>
      </ErrorPanel>
    </Shell>
  );
}

/**
 * `/verify` and `/verify/:shortCode` — the public verification surface
 * (rule 1.5: thin page). No auth, no Supabase session. With no code it is
 * the entry page; with a code it is the verdict, a compare-a-copy card and
 * collapsed technical details. An unknown code lands back on the entry page
 * with the field marked.
 */
export function VerifyPage() {
  const params = useParams<{ readonly shortCode: string }>();
  const shortCode = params.shortCode ?? '';
  const location = useLocation();
  const matchedState = (location.state as { matchedFile?: unknown } | null)?.matchedFile;
  const matchedFile = isMatchedFile(matchedState) ? matchedState : undefined;
  const query = useVerifyEnvelope(shortCode);
  const queryClient = useQueryClient();
  // Cancel any in-flight request, drop the cached result, then refetch.
  // `refetch()` alone won't re-issue while the prior promise is pending.
  const onRetry = useCallback(() => {
    const key = VERIFY_KEY(shortCode);
    queryClient.cancelQueries({ queryKey: key }).then(() => {
      queryClient.resetQueries({ queryKey: key });
    });
  }, [queryClient, shortCode]);

  if (shortCode === '') {
    return (
      <Shell>
        <EntryPanel />
        <EntryFooter>
          <Icon icon={ShieldCheck} size={14} />
          Verification by Seald
        </EntryFooter>
      </Shell>
    );
  }
  if (query.isPending) return <VerifyLoading onRetry={onRetry} />;
  if (query.isError) {
    const status = (query.error as { status?: number } | null)?.status;
    if (status === 404) {
      return (
        <Shell>
          <EntryPanel key={shortCode} rejectedCode={shortCode} />
          <EntryFooter>
            <Icon icon={ShieldCheck} size={14} />
            Verification by Seald
          </EntryFooter>
        </Shell>
      );
    }
    return <VerifyError message={query.error?.message} onRetry={onRetry} />;
  }
  return <VerifyContent data={query.data} matchedFile={matchedFile} />;
}
