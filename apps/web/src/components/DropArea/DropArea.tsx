import {
  forwardRef,
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '@/components/Button';
import {
  Actions,
  DropHeading,
  DropSubheading,
  Dropzone,
  ErrorText,
  HiddenFileInput,
  IconCircle,
} from './DropArea.styles';
import type { DropAreaErrorCode, DropAreaProps } from './DropArea.types';

const DEFAULT_ACCEPT = 'application/pdf,.pdf';
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

function matchesAccept(file: File, accept: string): boolean {
  const parts = accept
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return true;
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return parts.some((raw) => {
    const pat = raw.toLowerCase();
    if (pat.startsWith('.')) return name.endsWith(pat);
    if (pat.endsWith('/*')) return mime.startsWith(pat.slice(0, -1));
    return mime === pat;
  });
}

/**
 * The drag-and-drop dropzone the signer flow uses on `/document/new`,
 * lifted out of `UploadPage` so any flow can embed the same surface
 * inline without the page chrome.
 *
 * `UploadPage` itself now composes this component — see
 * `apps/web/src/pages/UploadPage/UploadPage.tsx`. The page layer adds
 * the NavBar, the page title, the analyzing-loader transition, and the
 * "using template" banner; everything below the fold is this component.
 *
 * Behavior:
 *   - Drag-enter / drag-leave depth tracking so a single child entering
 *     doesn't flicker the dragging state.
 *   - `accept` and `maxSizeBytes` validation; emits `onError(code, msg)`
 *     and renders an inline ErrorText.
 *   - Keyboard parity: the Choose-file button programmatically clicks a
 *     hidden `<input type="file">`.
 */
export const DropArea = forwardRef<HTMLDivElement, DropAreaProps>((props, ref) => {
  const {
    onFileSelected,
    onError,
    accept = DEFAULT_ACCEPT,
    maxSizeBytes = DEFAULT_MAX_BYTES,
    heading = 'Drop your PDF here',
    subheading,
    chooseLabel = 'Choose file',
    ...rest
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reactId = useId();
  const inputId = `${reactId}-file`;
  const errorId = `${reactId}-error`;

  const sizeMb = Math.round(maxSizeBytes / (1024 * 1024));
  const effectiveSubheading =
    subheading ?? `or choose a file from your computer · up to ${sizeMb} MB`;

  const raiseError = useCallback(
    (code: DropAreaErrorCode, message: string): void => {
      setError(message);
      onError?.(code, message);
    },
    [onError],
  );

  const ingest = useCallback(
    (file: File): void => {
      if (!matchesAccept(file, accept)) {
        raiseError('type', `This file type isn't supported. Please upload a PDF.`);
        return;
      }
      if (file.size > maxSizeBytes) {
        raiseError('size', `This file is larger than ${sizeMb} MB. Please choose a smaller file.`);
        return;
      }
      setError(null);
      onFileSelected(file);
    },
    [accept, maxSizeBytes, onFileSelected, raiseError, sizeMb],
  );

  const handleChooseClick = useCallback((e: MouseEvent<HTMLButtonElement>): void => {
    e.preventDefault();
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file) ingest(file);
      e.target.value = '';
    },
    [ingest],
  );

  const handleDragEnter = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current += 1;
    setDragging(true);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>): void => {
    e.preventDefault();
    e.stopPropagation();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) ingest(file);
    },
    [ingest],
  );

  return (
    <Dropzone
      ref={ref}
      $dragging={dragging}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      role="region"
      aria-label="Upload a PDF"
      {...(error ? { 'aria-describedby': errorId } : {})}
      {...rest}
    >
      <IconCircle>
        <UploadCloud size={28} strokeWidth={1.75} aria-hidden />
      </IconCircle>
      <DropHeading>{heading}</DropHeading>
      <DropSubheading>{effectiveSubheading}</DropSubheading>
      <Actions>
        <Button variant="primary" onClick={handleChooseClick}>
          {chooseLabel}
        </Button>
      </Actions>
      {error ? <ErrorText id={errorId}>{error}</ErrorText> : null}
      <HiddenFileInput
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        onChange={handleInputChange}
        aria-label="Choose PDF file"
      />
    </Dropzone>
  );
});

DropArea.displayName = 'DropArea';
