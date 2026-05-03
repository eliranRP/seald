import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileText, Home, Search, X } from 'lucide-react';
import { useTheme } from 'styled-components';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import {
  Backdrop,
  Card,
  CloseButton,
  Footer,
  FooterNote,
  Header,
  HeaderLogo,
  List,
  PathBar,
  PathRoot,
  Row,
  RowIcon,
  RowMain,
  RowMeta,
  RowName,
  SearchIcon,
  SearchInner,
  SearchInput,
  SearchWrap,
  SelectMark,
  Title,
} from './DrivePicker.styles';
import type { DriveFile, DrivePickerProps } from './DrivePicker.types';
import { SUPPORTED_MIME_TYPES } from './driveFilesApi';
import {
  EmptyFolderState,
  LoadingState,
  NetworkErrorState,
  NoResultsState,
  TokenExpiredState,
} from './states';
import { useDriveFiles, useReconnectAccount } from './useDriveFiles';

/**
 * Reusable Drive picker modal. Portal-rendered at the document body so
 * it always sits above whatever route mounted it.
 *
 * Dimensions are HARD-LOCKED via {@link PICKER_WIDTH_PX} /
 * {@link PICKER_HEIGHT_PX} constants per Phase 3 watchpoint #4 — do not
 * widen, do not make responsive. The hard cap is referenced by both the
 * styled `Card` and the unit tests below so a regression in either
 * surface fails CI.
 *
 * Portal target falls back to `null` during SSR / pre-mount; tests
 * exercise the JSDOM body directly.
 */
function mimeKind(mime: string): 'pdf' | 'gdoc' | 'docx' {
  if (mime === 'application/vnd.google-apps.document') return 'gdoc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return 'docx';
  }
  return 'pdf';
}

function kindLabel(kind: 'pdf' | 'gdoc' | 'docx'): string {
  if (kind === 'pdf') return 'PDF';
  if (kind === 'gdoc') return 'Doc';
  return 'Word';
}

function formatModified(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function buildMeta(file: DriveFile): string {
  const kind = mimeKind(file.mimeType);
  const parts: string[] = [kindLabel(kind)];
  const date = formatModified(file.modifiedTime);
  if (date) parts.push(date);
  return parts.join(' · ');
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function noopReconnect(): Promise<void> {
  return Promise.resolve();
}

export function DrivePicker(props: DrivePickerProps): JSX.Element | null {
  const { open, onClose, onPick, accountId, mimeFilter = 'all', onReconnect } = props;
  const titleId = useId();
  const t = useTheme();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error, tokenExpired, refetch } = useDriveFiles({
    accountId,
    mimeFilter,
    enabled: open,
  });

  const reconnectFn = useMemo(
    () => (onReconnect ? () => Promise.resolve(onReconnect()) : noopReconnect),
    [onReconnect],
  );
  const { reconnect, inFlight: reconnectInFlight } = useReconnectAccount(reconnectFn);

  // Reset search + selection every time the modal re-opens. One effect,
  // one responsibility (rule 4.4).
  useEffect(() => {
    if (!open) return;
    setSearch('');
    setSelectedId(null);
  }, [open]);

  // Capture the previously-focused element so we can restore it on
  // close — required for keyboard-only / screen-reader users.
  useEffect(() => {
    if (!open) return undefined;
    previouslyFocused.current = (document.activeElement as HTMLElement | null) ?? null;
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Move initial focus to the search input on open.
  useEffect(() => {
    if (!open) return;
    const card = cardRef.current;
    if (!card) return;
    const first = card.querySelector<HTMLElement>('input, button');
    first?.focus();
  }, [open]);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const safeFiles = useMemo(() => {
    if (!data) return [] as ReadonlyArray<DriveFile>;
    // Server already filters; we re-filter as defence in depth so a
    // future server bug can't smuggle a non-supported MIME into the UI.
    return data.files.filter((f) => SUPPORTED_MIME_TYPES.has(f.mimeType));
  }, [data]);

  const filteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return safeFiles;
    return safeFiles.filter((f) => f.name.toLowerCase().includes(q));
  }, [safeFiles, search]);

  const selectedFile = useMemo(
    () => filteredFiles.find((f) => f.id === selectedId) ?? null,
    [filteredFiles, selectedId],
  );

  if (!open) return null;
  if (typeof document === 'undefined') return null;

  // Trap Tab inside the dialog (rule 4.6 testable focus-trap).
  const onKeyDownInside = (e: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== 'Tab') return;
    const card = cardRef.current;
    if (!card) return;
    const focusables = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) => !el.hasAttribute('aria-hidden'),
    );
    if (focusables.length === 0) return;
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onBackdropClick = (): void => onClose();
  const stop = (e: MouseEvent<HTMLDivElement>): void => e.stopPropagation();

  // Determine which inner pane to render. The header/footer chrome
  // stays mounted across every state so the dialog frame is stable.
  let body: JSX.Element;
  if (tokenExpired) {
    body = <TokenExpiredState onReconnect={() => void reconnect()} inFlight={reconnectInFlight} />;
  } else if (error) {
    body = <NetworkErrorState onRetry={() => refetch()} />;
  } else if (isLoading) {
    body = (
      <List>
        <LoadingState />
      </List>
    );
  } else if (safeFiles.length === 0) {
    body = <EmptyFolderState />;
  } else if (filteredFiles.length === 0) {
    body = <NoResultsState query={search} />;
  } else {
    body = (
      <List role="listbox" aria-label="Drive files">
        {filteredFiles.map((f) => {
          const kind = mimeKind(f.mimeType);
          const palette =
            kind === 'pdf'
              ? { bg: t.color.danger[50], fg: t.color.danger[700] }
              : kind === 'gdoc'
                ? { bg: t.color.indigo[50], fg: t.color.indigo[700] }
                : { bg: t.color.indigo[50], fg: t.color.indigo[600] };
          const selected = selectedId === f.id;
          return (
            <Row
              key={f.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => setSelectedId(f.id)}
              onDoubleClick={() => onPick(f)}
            >
              <RowIcon $bg={palette.bg} $fg={palette.fg} aria-hidden>
                <Icon icon={FileText} size={18} />
              </RowIcon>
              <RowMain>
                <RowName>{f.name}</RowName>
                <RowMeta>{buildMeta(f)}</RowMeta>
              </RowMain>
              <SelectMark $selected={selected} aria-hidden>
                {selected ? <Icon icon={Check} size={14} /> : null}
              </SelectMark>
            </Row>
          );
        })}
      </List>
    );
  }

  const showSearchAndPath = !tokenExpired && !error;

  const dialog = (
    <Backdrop role="presentation" onClick={onBackdropClick}>
      <Card
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={stop}
        onKeyDown={onKeyDownInside}
      >
        <Header>
          <HeaderLogo aria-hidden>
            <Icon icon={Home} size={18} />
          </HeaderLogo>
          <Title id={titleId}>Pick from Google Drive</Title>
          <CloseButton type="button" onClick={onClose} aria-label="Close picker">
            <Icon icon={X} size={18} />
          </CloseButton>
        </Header>
        {showSearchAndPath ? (
          <>
            <PathBar>
              <Icon icon={Home} size={14} />
              <PathRoot>My Drive</PathRoot>
            </PathBar>
            <SearchWrap>
              <SearchInner>
                <SearchIcon aria-hidden>
                  <Icon icon={Search} size={16} />
                </SearchIcon>
                <SearchInput
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search PDFs, Docs, and Word documents in Drive…"
                  aria-label="Search Drive files"
                />
              </SearchInner>
            </SearchWrap>
          </>
        ) : null}
        {body}
        <Footer>
          <FooterNote>Showing PDFs, Google Docs, and Word documents.</FooterNote>
          <Button variant="ghost" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            iconLeft={Check}
            type="button"
            disabled={!selectedFile}
            onClick={() => selectedFile && onPick(selectedFile)}
          >
            Use this file
          </Button>
        </Footer>
      </Card>
    </Backdrop>
  );

  return createPortal(dialog, document.body);
}
