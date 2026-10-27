import { useCallback, useEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { ProgressBar } from '@/components/ProgressBar';
import { Spinner } from '@/components/Spinner';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { fileProblem, sha256Hex } from '@/features/verify';
import {
  CheckingRow,
  DropText,
  DropTitle,
  DropZone,
  HiddenInput,
  Meta,
  ResultBody,
  ResultCard,
  ResultChip,
} from './VerifyPage.styles';

export interface MatchedFile {
  readonly name: string;
  readonly size: number;
}

type CompareState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking'; readonly name: string }
  | { readonly kind: 'match'; readonly file: MatchedFile }
  | { readonly kind: 'nomatch'; readonly reason: string };

const NO_MATCH = "This file was changed after sealing, or it's a different document.";

export function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

interface FileCompareProps {
  /** Lowercase SHA-256 of every sealed PDF in the envelope. */
  readonly sealedHashes: ReadonlyArray<string>;
  /** Set when the visitor arrived by dropping this file on the entry page. */
  readonly initialMatch?: MatchedFile | undefined;
}

/**
 * "Have a copy? Drop the PDF to compare". The browser hashes the file with
 * SubtleCrypto; nothing is uploaded. The result describes the dropped file
 * only — it never changes the verdict above it.
 */
export function FileCompare({ sealedHashes, initialMatch }: FileCompareProps) {
  const [state, setState] = useState<CompareState>(
    initialMatch ? { kind: 'match', file: initialMatch } : { kind: 'idle' },
  );
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const isMobile = useIsMobileViewport();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const check = useCallback(
    async (file: File) => {
      const problem = fileProblem(file);
      if (problem === 'not_pdf') {
        setState({ kind: 'nomatch', reason: 'That is not a PDF. Drop the sealed PDF to compare.' });
        return;
      }
      if (problem === 'too_large') {
        setState({
          kind: 'nomatch',
          reason: 'That file is over 25 MB, which is too large to check.',
        });
        return;
      }
      setState({ kind: 'checking', name: file.name });
      try {
        const digest = await sha256Hex(file);
        if (!alive.current) return;
        setState(
          sealedHashes.includes(digest)
            ? { kind: 'match', file: { name: file.name, size: file.size } }
            : { kind: 'nomatch', reason: NO_MATCH },
        );
      } catch {
        if (alive.current) {
          setState({ kind: 'nomatch', reason: "We couldn't read that file in your browser." });
        }
      }
    },
    [sealedHashes],
  );

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void check(file);
  };

  const reset = () => setState({ kind: 'idle' });
  const idleTitle = isMobile
    ? 'Have a copy? Tap to compare'
    : 'Have a copy? Drop the PDF to compare';

  if (state.kind === 'checking') {
    return (
      <ResultCard
        role="status"
        aria-live="polite"
        style={{ flexDirection: 'column', alignItems: 'stretch', gap: 14 }}
      >
        <CheckingRow>
          <Spinner size="md" />
          {`Checking ${state.name}…`}
        </CheckingRow>
        <ProgressBar value={60} max={100} label="Checking file" />
      </ResultCard>
    );
  }
  if (state.kind === 'match') {
    return (
      <ResultCard>
        <ResultBody>
          <ResultChip state="ok">Matches the sealed copy</ResultChip>
          <Meta>{`${state.file.name} · ${formatSize(state.file.size)}`}</Meta>
        </ResultBody>
        <Button variant="ghost" size="sm" onClick={reset}>
          Check another
        </Button>
      </ResultCard>
    );
  }
  if (state.kind === 'nomatch') {
    return (
      <ResultCard $bad role="alert">
        <ResultBody>
          <ResultChip state="bad">{"Doesn't match"}</ResultChip>
          <Meta>{state.reason}</Meta>
        </ResultBody>
        <Button variant="ghost" size="sm" onClick={reset}>
          Check another
        </Button>
      </ResultCard>
    );
  }

  const pick = () => input.current?.click();
  const fileInput = (
    <HiddenInput
      ref={input}
      type="file"
      accept="application/pdf,.pdf"
      aria-label="Choose a PDF to compare"
      tabIndex={-1}
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void check(file);
      }}
    />
  );

  // Phone: the whole card is the tap target (no drag, no separate button).
  if (isMobile) {
    return (
      <>
        <DropZone
          as="button"
          type="button"
          $over={false}
          onClick={pick}
          data-testid="verify-dropzone"
        >
          <Icon icon={Upload} size={24} />
          <DropText>
            <DropTitle>{idleTitle}</DropTitle>
            <Meta>Checked in your browser · never uploaded</Meta>
          </DropText>
        </DropZone>
        {fileInput}
      </>
    );
  }

  return (
    <DropZone
      $over={over}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      data-testid="verify-dropzone"
    >
      <Icon icon={Upload} size={24} />
      <DropText>
        <DropTitle>{over ? 'Drop to compare' : idleTitle}</DropTitle>
        <Meta>Checked in your browser · never uploaded</Meta>
      </DropText>
      <Button variant="secondary" size="sm" onClick={pick}>
        Choose file
      </Button>
      {fileInput}
    </DropZone>
  );
}
