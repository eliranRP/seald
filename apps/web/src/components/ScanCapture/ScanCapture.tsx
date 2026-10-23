import { useCallback, useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Lock,
  Plus,
  X,
} from 'lucide-react';
import { SCAN_MAX_PAGES } from 'shared';
import { buildScanPdf } from '@/features/scan/buildScanPdf';
import { SCAN_FILTERS, type ScanFilter } from '@/features/scan/imageFilters';
import { captureFrame, normalizePhoto, renderFiltered } from '@/features/scan/scanImaging';
import { useScanCamera } from '@/features/scan/useScanCamera';
import { Button } from '../Button';
import { ProgressBar } from '../ProgressBar';
import { SegmentedControl } from '../SegmentedControl';
import { Spinner } from '../Spinner';
import type { ScanCaptureProps, ScanPage } from './ScanCapture.types';
import {
  AddTile,
  BarSlot,
  CamBar,
  CamThumb,
  CamView,
  Center,
  CountBadge,
  Flash,
  Grid,
  HiddenInput,
  Hint,
  IconButton,
  Meta,
  ProgressWrap,
  Root,
  SheetBody,
  SheetFoot,
  SheetTitle,
  SheetTop,
  Shutter,
  StateIcon,
  Tile,
  TileActions,
  TileButton,
  TileImage,
  TileNumber,
  TopBar,
  Video,
  Sheet,
} from './ScanCapture.styles';

type Phase = 'camera' | 'review' | 'making';

const THUMB_EDGE = 360;
const FLASH_MS = 700;

let pageSeq = 0;
function nextPageId(): string {
  pageSeq += 1;
  return `scan-page-${pageSeq}`;
}

function pagesLabel(n: number): string {
  return n === 1 ? '1 page' : `${n} pages`;
}

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') return new Uint8Array(await blob.arrayBuffer());
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * L3 widget: the phone scanner (design `ScanMobile`). Rear camera with a
 * manual shutter, a review grid (remove, reorder, add), a Document / Color /
 * B&W filter, and a client-side PDF build. When the camera is blocked it falls
 * back to picking photos. The host decides what happens to the PDF.
 */
export function ScanCapture(props: ScanCaptureProps): JSX.Element {
  const { onComplete, onClose } = props;
  const [phase, setPhase] = useState<Phase>('camera');
  const [pages, setPages] = useState<ReadonlyArray<ScanPage>>([]);
  const [filter, setFilter] = useState<ScanFilter>('document');
  const [thumbs, setThumbs] = useState<Readonly<Record<string, string>>>({});
  const [flashKey, setFlashKey] = useState(0);
  const [captured, setCaptured] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [buildFailed, setBuildFailed] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { videoRef, status: cameraStatus, retry: retryCamera } = useScanCamera(phase === 'camera');
  const full = pages.length >= SCAN_MAX_PAGES;

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  // Thumbnails follow the pages and the filter.
  useEffect(() => {
    if (phase !== 'review') return undefined;
    let cancelled = false;
    const made: string[] = [];
    void Promise.all(
      pages.map(async (page) => {
        try {
          const blob = await renderFiltered(page.blob, filter, THUMB_EDGE);
          const url = URL.createObjectURL(blob);
          made.push(url);
          return [page.id, url] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        made.forEach((u) => URL.revokeObjectURL(u));
        return;
      }
      const next: Record<string, string> = {};
      for (const entry of entries) if (entry) next[entry[0]] = entry[1];
      setThumbs(next);
    });
    return () => {
      cancelled = true;
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pages, filter, phase]);

  const countRef = useRef(0);
  useEffect(() => {
    countRef.current = pages.length;
  }, [pages]);

  const addBlobs = useCallback((blobs: ReadonlyArray<Blob>): void => {
    const room = Math.max(0, SCAN_MAX_PAGES - countRef.current);
    const added = blobs.slice(0, room).map((blob) => ({ id: nextPageId(), blob }));
    if (added.length === 0) return;
    countRef.current += added.length;
    setCaptured(countRef.current);
    setPages((prev) => [...prev, ...added]);
  }, []);

  const handleShutter = useCallback(async (): Promise<void> => {
    const video = videoRef.current;
    if (!video || full) return;
    setCaptureFailed(false);
    try {
      const blob = await captureFrame(video);
      addBlobs([blob]);
      setFlashKey((k) => k + 1);
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlashKey(0), FLASH_MS);
    } catch {
      setCaptureFailed(true);
    }
  }, [addBlobs, videoRef, full]);

  const handlePicked = useCallback(
    async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';
      if (files.length === 0) return;
      setCaptureFailed(false);
      const results = await Promise.all(files.map((f) => normalizePhoto(f).catch(() => null)));
      const blobs = results.filter((b): b is Blob => b !== null);
      if (blobs.length < files.length) setCaptureFailed(true);
      if (blobs.length === 0) return;
      addBlobs(blobs);
      setPhase('review');
    },
    [addBlobs],
  );

  const removePage = useCallback((id: string): void => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const movePage = useCallback((index: number, by: -1 | 1): void => {
    setPages((prev) => {
      const target = index + by;
      const a = prev[index];
      const b = prev[target];
      if (!a || !b) return prev;
      const next = [...prev];
      next[index] = b;
      next[target] = a;
      return next;
    });
  }, []);

  const handleRetake = useCallback((): void => {
    setPages([]);
    setThumbs({});
    setCaptured(null);
    setPhase('camera');
  }, []);

  const handleUse = useCallback(async (): Promise<void> => {
    if (pages.length === 0) return;
    setBuildFailed(false);
    setProgress(0);
    setPhase('making');
    try {
      const jpegs: Uint8Array[] = [];
      for (const page of pages) {
        const blob = await renderFiltered(page.blob, filter);
        jpegs.push(await blobBytes(blob));
        setProgress((p) => p + 1);
      }
      const pdf = await buildScanPdf(jpegs);
      await onComplete(pdf);
    } catch {
      setBuildFailed(true);
      setPhase('review');
    }
  }, [filter, onComplete, pages]);

  const picker = (
    <HiddenInput
      ref={fileInput}
      type="file"
      accept="image/*"
      multiple
      aria-label="Choose photos"
      data-testid="scan-photo-input"
      onChange={(e) => void handlePicked(e)}
    />
  );
  const openPicker = (): void => fileInput.current?.click();

  if (phase === 'making') {
    return (
      <Root>
        <Sheet>
          <Center role="status" aria-live="polite">
            <Spinner size="lg" />
            <h2>Making your PDF…</h2>
            <ProgressWrap>
              <ProgressBar
                value={progress}
                max={pages.length}
                label={`Processed ${progress} of ${pages.length} pages`}
              />
            </ProgressWrap>
          </Center>
        </Sheet>
      </Root>
    );
  }

  if (phase === 'review') {
    return (
      <Root>
        <Sheet>
          <SheetTop>
            <SheetTitle>{pagesLabel(pages.length)}</SheetTitle>
            <Button variant="ghost" size="sm" onClick={handleRetake}>
              Retake
            </Button>
          </SheetTop>
          <SheetBody>
            <Grid aria-label="Scanned pages">
              {pages.map((page, index) => (
                <Tile key={page.id}>
                  {thumbs[page.id] ? (
                    <TileImage src={thumbs[page.id]} alt={`Page ${index + 1}`} />
                  ) : null}
                  <TileNumber aria-hidden>{index + 1}</TileNumber>
                  <TileActions>
                    <TileButton
                      type="button"
                      aria-label={`Move page ${index + 1} earlier`}
                      disabled={index === 0}
                      onClick={() => movePage(index, -1)}
                    >
                      <ChevronLeft size={16} aria-hidden />
                    </TileButton>
                    <TileButton
                      type="button"
                      aria-label={`Move page ${index + 1} later`}
                      disabled={index === pages.length - 1}
                      onClick={() => movePage(index, 1)}
                    >
                      <ChevronRight size={16} aria-hidden />
                    </TileButton>
                    <TileButton
                      type="button"
                      aria-label={`Remove page ${index + 1}`}
                      onClick={() => removePage(page.id)}
                    >
                      <X size={16} aria-hidden />
                    </TileButton>
                  </TileActions>
                </Tile>
              ))}
              <AddTile>
                <button
                  type="button"
                  disabled={full}
                  onClick={() => {
                    if (cameraStatus === 'blocked') openPicker();
                    else setPhase('camera');
                  }}
                >
                  <Plus size={20} aria-hidden />
                  Add page
                </button>
              </AddTile>
            </Grid>
            {full ? <Meta>{`${SCAN_MAX_PAGES} pages is the most one scan can hold.`}</Meta> : null}
            <SegmentedControl
              aria-label="Filter"
              options={SCAN_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
              value={filter}
              onChange={setFilter}
              block
            />
            {buildFailed ? (
              <Meta $error role="alert">
                {'Something went wrong. Try again.'}
              </Meta>
            ) : null}
            {captureFailed ? (
              <Meta $error role="alert">
                {"Some photos couldn't be read."}
              </Meta>
            ) : null}
          </SheetBody>
          <SheetFoot>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              iconRight={ArrowRight}
              disabled={pages.length === 0}
              onClick={() => void handleUse()}
            >
              {`Use ${pagesLabel(pages.length)}`}
            </Button>
          </SheetFoot>
          {picker}
        </Sheet>
      </Root>
    );
  }

  if (cameraStatus === 'blocked') {
    return (
      <Root>
        <Sheet>
          <SheetTop>
            <span />
            {onClose ? (
              <IconButton $light type="button" aria-label="Close" onClick={onClose}>
                <X size={20} aria-hidden />
              </IconButton>
            ) : null}
          </SheetTop>
          <Center>
            <StateIcon aria-hidden>
              <Lock size={24} />
            </StateIcon>
            <h2>Camera is blocked</h2>
            <Meta>Allow camera in browser settings, or choose photos you already took.</Meta>
            <Button variant="primary" iconLeft={ImageIcon} onClick={openPicker}>
              Choose from photos
            </Button>
            <Button variant="ghost" onClick={retryCamera}>
              Try the camera again
            </Button>
            {pages.length > 0 ? (
              <Button variant="secondary" onClick={() => setPhase('review')}>
                {`Review ${pagesLabel(pages.length)}`}
              </Button>
            ) : null}
            {captureFailed ? (
              <Meta $error role="alert">
                {"Some photos couldn't be read."}
              </Meta>
            ) : null}
          </Center>
          {picker}
        </Sheet>
      </Root>
    );
  }

  let hint: JSX.Element | string = 'Fit the page in the frame';
  if (captured !== null && flashKey > 0) {
    hint = (
      <>
        <CheckCircle2 size={14} aria-hidden />
        {`Page ${captured} captured`}
      </>
    );
  } else if (cameraStatus === 'starting') {
    hint = (
      <>
        <Camera size={14} aria-hidden />
        Starting the camera…
      </>
    );
  } else if (full) {
    hint = `${SCAN_MAX_PAGES} pages is the most`;
  }

  return (
    <Root>
      <CamView>
        <Video ref={videoRef} playsInline muted aria-label="Camera" />
        {flashKey > 0 ? <Flash key={flashKey} aria-hidden /> : null}
        <TopBar>
          {onClose ? (
            <IconButton type="button" aria-label="Close" onClick={onClose}>
              <X size={22} aria-hidden />
            </IconButton>
          ) : (
            <span />
          )}
        </TopBar>
        <Hint role="status" aria-live="polite">
          {hint}
        </Hint>
        {captureFailed ? (
          <Meta $error role="alert">
            {"Couldn't take that photo."}
          </Meta>
        ) : null}
      </CamView>
      <CamBar>
        <BarSlot>
          <IconButton type="button" aria-label="From photos" onClick={openPicker}>
            <ImageIcon size={24} aria-hidden />
          </IconButton>
        </BarSlot>
        <Shutter
          type="button"
          aria-label="Capture"
          disabled={cameraStatus !== 'live' || full}
          onClick={() => void handleShutter()}
        />
        <BarSlot>
          {pages.length > 0 ? (
            <CamThumb
              type="button"
              aria-label={`Review ${pagesLabel(pages.length)}`}
              onClick={() => setPhase('review')}
            >
              <CountBadge aria-hidden>{pages.length}</CountBadge>
            </CamThumb>
          ) : null}
        </BarSlot>
      </CamBar>
      {picker}
    </Root>
  );
}
