import { useRef, useState } from 'react';
import type { DragEvent, FormEvent } from 'react';
import { AlertCircle, ShieldCheck, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Spinner } from '@/components/Spinner';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { fileProblem, lookupShortCodeByHash, sha256Hex } from '@/features/verify';
import {
  CodeForm,
  CodeInput,
  DropText,
  DropTitle,
  EntryDrop,
  EntryStack,
  EntryTitle,
  HiddenInput,
  InlineAlert,
  Meta,
  OrRow,
  OrRule,
  Verdict,
  VerdictIcon,
  VerifyButton,
} from './VerifyPage.styles';

const CODE_LENGTH = 13;

interface EntryPanelProps {
  /** A code that came back 404: shown in the field with an error. */
  readonly rejectedCode?: string | undefined;
}

/** Short codes are case-sensitive, so the field keeps the case it is given. */
function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, '').slice(0, CODE_LENGTH);
}

/**
 * `/verify` with no code: type or paste the 13-character short code, or drop
 * the sealed PDF and let the server find it by hash.
 */
export function EntryPanel({ rejectedCode }: EntryPanelProps) {
  const navigate = useNavigate();
  const [code, setCode] = useState(rejectedCode ?? '');
  const [codeError, setCodeError] = useState(rejectedCode !== undefined);
  const [fileError, setFileError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const isMobile = useIsMobileViewport();

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (code.length === CODE_LENGTH) navigate(`/verify/${encodeURIComponent(code)}`);
  };

  const findByFile = async (file: File) => {
    setFileError(null);
    const problem = fileProblem(file);
    if (problem === 'not_pdf') {
      setFileError('That is not a PDF. Drop the sealed PDF.');
      return;
    }
    if (problem === 'too_large') {
      setFileError('That file is over 25 MB, which is too large to check.');
      return;
    }
    setBusy(true);
    try {
      const digest = await sha256Hex(file);
      const short = await lookupShortCodeByHash(digest);
      navigate(`/verify/${encodeURIComponent(short)}`, {
        state: { matchedFile: { name: file.name, size: file.size } },
      });
    } catch (err) {
      const status = (err as { status?: unknown }).status;
      setFileError(
        status === 404
          ? 'No sealed document matches this file.'
          : 'Something went wrong. Try again in a moment.',
      );
    } finally {
      setBusy(false);
    }
  };

  const pick = () => input.current?.click();
  const dropIcon = busy ? (
    <Spinner size="lg" label="Looking up the file" />
  ) : (
    <Icon icon={Upload} size={isMobile ? 24 : 32} />
  );
  const dropMeta = <Meta>We look up its hash on the server. The file is not uploaded.</Meta>;

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setOver(false);
    const file = event.dataTransfer.files[0];
    if (file) void findByFile(file);
  };

  return (
    <EntryStack>
      <Verdict>
        <VerdictIcon $tone="off">
          <Icon icon={ShieldCheck} size={48} />
        </VerdictIcon>
        <EntryTitle>Verify a document</EntryTitle>
      </Verdict>

      <CodeForm onSubmit={onSubmit}>
        <CodeInput
          type="text"
          inputMode="text"
          maxLength={CODE_LENGTH}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label="Verification code"
          aria-invalid={codeError}
          aria-describedby="verify-code-help"
          placeholder="13-character code"
          $error={codeError}
          value={code}
          onChange={(e) => {
            setCode(cleanCode(e.target.value));
            setCodeError(false);
          }}
          onPaste={(e) => {
            e.preventDefault();
            setCode(cleanCode(e.clipboardData.getData('text')));
            setCodeError(false);
          }}
        />
        <Meta id="verify-code-help">Find the code in the PDF footer or scan its QR.</Meta>
        {codeError ? (
          <InlineAlert role="alert">
            <Icon icon={AlertCircle} size={14} />
            No document with this code
          </InlineAlert>
        ) : null}
        <VerifyButton type="submit" disabled={code.length !== CODE_LENGTH}>
          Verify
        </VerifyButton>
      </CodeForm>

      <OrRow aria-hidden>
        <OrRule />
        <Meta>or</Meta>
        <OrRule />
      </OrRow>

      {isMobile ? (
        // Phone: the whole card is the tap target (no drag, no separate button).
        <EntryDrop
          as="button"
          type="button"
          $over={false}
          disabled={busy}
          onClick={pick}
          data-testid="verify-entry-dropzone"
        >
          {dropIcon}
          <DropText style={{ alignItems: 'center', flex: 'none' }}>
            <DropTitle>Tap to choose the PDF</DropTitle>
            {dropMeta}
          </DropText>
        </EntryDrop>
      ) : (
        <EntryDrop
          $over={over}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          data-testid="verify-entry-dropzone"
        >
          {dropIcon}
          <DropText style={{ alignItems: 'center', flex: 'none' }}>
            <DropTitle>{over ? 'Drop to look it up' : 'Drop the sealed PDF'}</DropTitle>
            {dropMeta}
          </DropText>
          <Button variant="secondary" size="sm" disabled={busy} onClick={pick}>
            Choose file
          </Button>
        </EntryDrop>
      )}
      <HiddenInput
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        aria-label="Choose the sealed PDF"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void findByFile(file);
        }}
      />
      {fileError ? (
        <InlineAlert role="alert">
          <Icon icon={AlertCircle} size={14} />
          {fileError}
        </InlineAlert>
      ) : null}
    </EntryStack>
  );
}
