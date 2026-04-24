import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { Check, ShieldCheck, Upload, X as XIcon } from 'lucide-react';
import { Icon } from '../Icon';
import { SignatureMark } from '../SignatureMark';
import type {
  SignatureCaptureFormat,
  SignatureCaptureProps,
  SignatureCaptureResult,
} from './SignatureCapture.types';
import {
  ApplyBtn,
  Backdrop,
  CancelBtn,
  CloseBtn,
  DrawCanvas,
  DrawHint,
  Eyebrow,
  Footer,
  FooterActions,
  FooterMeta,
  HeaderRow,
  InitialScript,
  PreviewPanel,
  Sheet,
  Tab,
  Tabs,
  TextInput,
  Title,
  UploadArea,
} from './SignatureCapture.styles';

const CAPTURE_WIDTH = 600;
const CAPTURE_HEIGHT = 200;
const DRAW_COLOR = '#0B1220';

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

function renderTypedToCanvas(text: string, kind: 'signature' | 'initials'): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_WIDTH;
  canvas.height = CAPTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = DRAW_COLOR;
    const fontSize = kind === 'initials' ? 110 : 78;
    ctx.font = `500 ${fontSize}px Caveat, cursive`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  return canvas;
}

/**
 * L2 bottom-sheet that captures a signature or initials. Tabs: type / draw /
 * upload. Emits a `SignatureCaptureResult` containing a PNG blob plus format
 * metadata (`font` for typed, `stroke_count` for drawn, `source_filename`
 * for upload) — directly compatible with the backend's `/sign/signature`
 * multipart body.
 *
 * Focus + a11y: when opened, focus moves to the close button. Escape closes.
 * Backdrop click also closes. The sheet itself traps focus implicitly via
 * tab order (Cancel / Apply are the last focusable elements).
 */
export const SignatureCapture = forwardRef<HTMLDivElement, SignatureCaptureProps>((props, ref) => {
  const { open, kind, defaultName, onCancel, onApply, ...rest } = props;

  const [tab, setTab] = useState<SignatureCaptureFormat>('typed');
  const [typed, setTyped] = useState<string>(() =>
    kind === 'initials'
      ? defaultName
          .split(/\s+/)
          .map((p) => p[0] ?? '')
          .join('')
          .slice(0, 3)
          .toUpperCase()
      : defaultName,
  );
  const [strokeCount, setStrokeCount] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<boolean>(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const reset = useCallback(() => {
    setTab('typed');
    setTyped(
      kind === 'initials'
        ? defaultName
            .split(/\s+/)
            .map((p) => p[0] ?? '')
            .join('')
            .slice(0, 3)
            .toUpperCase()
        : defaultName,
    );
    setStrokeCount(0);
    setUploadFile(null);
    setUploadName('');
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [defaultName, kind]);

  useEffect(() => {
    if (!open) return undefined;
    reset();
    // Move focus to close button after mount so keyboard users have a
    // predictable entry point.
    const t = setTimeout(() => closeBtnRef.current?.focus(), 0);
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onCancel, reset]);

  // Pointer handlers for draw tab.
  const posOnCanvas = (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) * canvas.width) / rect.width,
      y: ((e.clientY - rect.top) * canvas.height) / rect.height,
    };
  };

  const handleDrawStart = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setStrokeCount((n) => n + 1);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = posOnCanvas(e);
    ctx.strokeStyle = DRAW_COLOR;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const handleDrawMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = posOnCanvas(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleDrawEnd = (): void => {
    drawingRef.current = false;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx) ctx.closePath();
  };

  const clearDraw = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokeCount(0);
  };

  const handleUploadChoose = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadName(file?.name ?? '');
  };

  const canApply = (() => {
    if (tab === 'typed') return typed.trim().length > 0;
    if (tab === 'drawn') return strokeCount > 0;
    return uploadFile !== null;
  })();

  const handleApply = async (): Promise<void> => {
    if (!canApply) return;
    if (tab === 'typed') {
      const canvas = renderTypedToCanvas(typed, kind);
      const blob = await canvasToPngBlob(canvas);
      const result: SignatureCaptureResult = {
        blob,
        format: 'typed',
        font: 'Caveat',
        source_filename: `${kind}.png`,
      };
      onApply(result);
      return;
    }
    if (tab === 'drawn') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const blob = await canvasToPngBlob(canvas);
      const result: SignatureCaptureResult = {
        blob,
        format: 'drawn',
        stroke_count: strokeCount,
        source_filename: `${kind}.png`,
      };
      onApply(result);
      return;
    }
    if (uploadFile) {
      const result: SignatureCaptureResult = {
        blob: uploadFile,
        format: 'upload',
        source_filename: uploadFile.name,
      };
      onApply(result);
    }
  };

  if (!open) return null;

  const eyebrowText = kind === 'signature' ? 'Add your signature' : 'Add your initials';
  const titleText = kind === 'signature' ? 'Signature' : 'Initials';

  return (
    <Backdrop
      role="dialog"
      aria-modal="true"
      aria-label={titleText}
      onClick={onCancel}
      ref={ref}
      {...rest}
    >
      <Sheet onClick={(e) => e.stopPropagation()}>
        <HeaderRow>
          <div>
            <Eyebrow>{eyebrowText}</Eyebrow>
            <Title>{titleText}</Title>
          </div>
          <CloseBtn type="button" onClick={onCancel} aria-label="Cancel" ref={closeBtnRef}>
            <Icon icon={XIcon} size={16} />
          </CloseBtn>
        </HeaderRow>

        <Tabs role="tablist">
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === 'typed'}
            $active={tab === 'typed'}
            onClick={() => setTab('typed')}
          >
            type
          </Tab>
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === 'drawn'}
            $active={tab === 'drawn'}
            onClick={() => setTab('drawn')}
          >
            draw
          </Tab>
          <Tab
            type="button"
            role="tab"
            aria-selected={tab === 'upload'}
            $active={tab === 'upload'}
            onClick={() => setTab('upload')}
          >
            upload
          </Tab>
        </Tabs>

        {tab === 'typed' ? (
          <div>
            <TextInput
              aria-label={kind === 'signature' ? 'Your full name' : 'Initials'}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={kind === 'signature' ? 'Your full name' : 'Initials'}
            />
            <PreviewPanel>
              {kind === 'signature' ? (
                <SignatureMark name={typed} size={48} />
              ) : (
                <InitialScript>{typed || '—'}</InitialScript>
              )}
            </PreviewPanel>
          </div>
        ) : null}

        {tab === 'drawn' ? (
          <div>
            <DrawCanvas
              ref={canvasRef}
              width={CAPTURE_WIDTH}
              height={CAPTURE_HEIGHT}
              aria-label="Draw your signature"
              onPointerDown={handleDrawStart}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
              onPointerLeave={handleDrawEnd}
              data-stroke-count={strokeCount}
            />
            <DrawHint>
              {strokeCount === 0
                ? 'Click and drag with your mouse or finger'
                : `${strokeCount} stroke${strokeCount === 1 ? '' : 's'}`}
              {strokeCount > 0 ? (
                <>
                  {' · '}
                  <button
                    type="button"
                    onClick={clearDraw}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      color: 'inherit',
                      font: 'inherit',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Clear
                  </button>
                </>
              ) : null}
            </DrawHint>
          </div>
        ) : null}

        {tab === 'upload' ? (
          <UploadArea>
            <Icon icon={Upload} size={24} />
            <div>Upload an image of your signature (PNG or JPEG)</div>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleUploadChoose}
              aria-label="Choose signature image"
            />
            {uploadName ? <div style={{ fontSize: 11 }}>{uploadName}</div> : null}
          </UploadArea>
        ) : null}

        <Footer>
          <FooterMeta>
            <Icon icon={ShieldCheck} size={12} />
            Encrypted and audit-logged
          </FooterMeta>
          <FooterActions>
            <CancelBtn type="button" onClick={onCancel}>
              Cancel
            </CancelBtn>
            <ApplyBtn type="button" onClick={handleApply} disabled={!canApply}>
              <Icon icon={Check} size={14} />
              Apply
            </ApplyBtn>
          </FooterActions>
        </Footer>
      </Sheet>
    </Backdrop>
  );
});
SignatureCapture.displayName = 'SignatureCapture';
