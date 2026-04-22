import { forwardRef, useCallback, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, MouseEvent } from 'react';
import { UploadCloud } from 'lucide-react';
import { Button } from '../../components/Button';
import { NavBar } from '../../components/NavBar';
import { SideBar } from '../../components/SideBar';
import type { UploadPageErrorCode, UploadPageProps } from './UploadPage.types';
import {
  Actions,
  Body,
  DropHeading,
  DropSubheading,
  Dropzone,
  ErrorText,
  Heading,
  HiddenFileInput,
  IconCircle,
  Inner,
  Main,
  Shell,
  Subtitle,
} from './UploadPage.styles';

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_ACCEPT = 'application/pdf';
const DEFAULT_TITLE = 'Start a new document';
const DEFAULT_SUBTITLE =
  "Drop a PDF, or choose from your computer. We'll walk you through placing signature fields and sending it off.";
const DEFAULT_DROP_HEADING = 'Drop your PDF here';
const DEFAULT_CHOOSE = 'Choose file';

/**
 * Returns true when the file matches `accept`. Accepts a comma-separated list
 * of MIME types and/or dotted extensions, matching the `<input accept>` spec.
 */
function matchesAccept(file: File, accept: string): boolean {
  const parts = accept
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    return true;
  }
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();
  return parts.some((raw) => {
    const pat = raw.toLowerCase();
    if (pat.startsWith('.')) {
      return name.endsWith(pat);
    }
    if (pat.endsWith('/*')) {
      const prefix = pat.slice(0, -1);
      return mime.startsWith(prefix);
    }
    return mime === pat;
  });
}

export const UploadPage = forwardRef<HTMLDivElement, UploadPageProps>((props, ref) => {
  const {
    onFileSelected,
    onError,
    onLogoClick,
    onSelectNavItem,
    activeNavId = 'documents',
    user,
    sideBarItems,
    onSelectSideBarItem,
    activeSideBarItemId,
    onAddContact,
    onRemoveContact,
    title = DEFAULT_TITLE,
    subtitle = DEFAULT_SUBTITLE,
    dropHeading = DEFAULT_DROP_HEADING,
    dropSubheading,
    chooseLabel = DEFAULT_CHOOSE,
    accept = DEFAULT_ACCEPT,
    maxSizeBytes = DEFAULT_MAX_BYTES,
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
  const effectiveDropSubheading =
    dropSubheading ?? `or choose a file from your computer · up to ${sizeMb} MB`;

  const raiseError = useCallback(
    (code: UploadPageErrorCode, message: string): void => {
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

  const openPicker = useCallback((): void => {
    inputRef.current?.click();
  }, []);

  const handleChooseClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>): void => {
      e.preventDefault();
      openPicker();
    },
    [openPicker],
  );

  const handleInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (file) {
        ingest(file);
      }
      // Allow re-selecting the same file later.
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
    if (dragDepth.current === 0) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>): void => {
      e.preventDefault();
      e.stopPropagation();
      dragDepth.current = 0;
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        ingest(file);
      }
    },
    [ingest],
  );

  return (
    <Shell {...rest} ref={ref}>
      <NavBar
        activeItemId={activeNavId}
        onSelectItem={onSelectNavItem}
        {...(user ? { user } : {})}
        {...(onAddContact ? { onAddContact } : {})}
        {...(onRemoveContact ? { onRemoveContact } : {})}
        {...(onLogoClick
          ? {
              logo: (
                <button
                  type="button"
                  onClick={onLogoClick}
                  aria-label="Go home"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    font: 'inherit',
                    color: 'inherit',
                  }}
                >
                  Sealed
                </button>
              ),
            }
          : {})}
      />
      <Body>
        <SideBar
          primaryAction={{ label: 'New document', onClick: openPicker, icon: UploadCloud }}
          {...(sideBarItems ? { items: sideBarItems } : {})}
          {...(activeSideBarItemId !== undefined ? { activeItemId: activeSideBarItemId } : {})}
          {...(onSelectSideBarItem ? { onSelectItem: onSelectSideBarItem } : {})}
        />
        <Main>
          <Inner>
            <div>
              <Heading>{title}</Heading>
              <Subtitle>{subtitle}</Subtitle>
            </div>
            <Dropzone
              $dragging={dragging}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              role="region"
              aria-label="Upload a PDF"
              {...(error ? { 'aria-describedby': errorId } : {})}
            >
              <IconCircle>
                <UploadCloud size={28} strokeWidth={1.75} aria-hidden />
              </IconCircle>
              <DropHeading>{dropHeading}</DropHeading>
              <DropSubheading>{effectiveDropSubheading}</DropSubheading>
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
          </Inner>
        </Main>
      </Body>
    </Shell>
  );
});

UploadPage.displayName = 'UploadPage';
