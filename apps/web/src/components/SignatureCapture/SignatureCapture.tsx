import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import { PenLine, ShieldCheck, Undo2, Upload } from 'lucide-react';
import { seald } from '@/styles/theme';
import { Button } from '../Button';
import { Icon } from '../Icon';
import { SegmentedControl } from '../SegmentedControl';
import { SheetDialog } from '../SheetDialog';
import type {
  SignatureCaptureFormat,
  SignatureCaptureKind,
  SignatureCaptureProps,
  SignatureCaptureResult,
} from './SignatureCapture.types';
import {
  DrawCanvas,
  DrawHint,
  Ink,
  Meta,
  NameField,
  Pad,
  PadClear,
  UploadArea,
} from './SignatureCapture.styles';
import { getTypedPreference, saveTypedPreference } from './typedPreferences';

export function deriveInitialsFromName(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 3)
    .toUpperCase();
}

function computeInitialTyped(args: {
  readonly kind: SignatureCaptureKind;
  readonly defaultName: string;
  readonly email: string;
}): string {
  const saved = getTypedPreference({ email: args.email, kind: args.kind });
  if (saved !== null) return saved;
  return args.kind === 'initials' ? deriveInitialsFromName(args.defaultName) : args.defaultName;
}

export const CAPTURE_WIDTH = 600;
export const CAPTURE_HEIGHT = 200;
const DRAW_COLOR = seald.color.ink[900];

/**
 * Compute the font size that makes `text` fit within `maxWidth` pixels.
 * Starts at `maxFontSize` and shrinks by 2px until it fits or hits
 * `minFontSize`. Exported for testing.
 */
export function computeScaledFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxFontSize: number,
  minFontSize: number,
  maxWidth: number,
  fontFamily: string,
): number {
  let fontSize = maxFontSize;
  ctx.font = `500 ${fontSize}px ${fontFamily}`;
  while (fontSize > minFontSize && ctx.measureText(text).width > maxWidth) {
    fontSize -= 2;
    ctx.font = `500 ${fontSize}px ${fontFamily}`;
  }
  return fontSize;
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('toBlob returned null'));
    }, 'image/png');
  });
}

export function renderTypedToCanvas(
  text: string,
  kind: 'signature' | 'initials',
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = CAPTURE_WIDTH;
  canvas.height = CAPTURE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = DRAW_COLOR;
    const maxFontSize = kind === 'initials' ? 110 : 78;
    const maxTextWidth = canvas.width - 40; // 20px padding each side
    const fontFamily = 'Caveat, cursive';
    const fontSize = computeScaledFontSize(ctx, text, maxFontSize, 28, maxTextWidth, fontFamily);
    ctx.font = `500 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    // Use 'middle' baseline and center vertically so the signature
    // appears centered in the field box when the image is stretched
    // to fit on the PDF. The image is drawn at { x, y, width, height }
    // of the field — if the text isn't centered in the canvas, it
    // shifts up or down after scaling.
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }
  return canvas;
}

/**
 * Typed signature or initials as the PNG result the API takes, with no UI.
 * Used to adopt the signer's name (or the initials derived from it) in one
 * step, without opening the sheet.
 */
export async function typedCaptureResult(
  text: string,
  kind: SignatureCaptureKind,
): Promise<SignatureCaptureResult> {
  const blob = await canvasToPngBlob(renderTypedToCanvas(text, kind));
  return { blob, format: 'typed', font: 'Caveat', source_filename: `${kind}.png` };
}

const TAB_OPTIONS = [
  { value: 'typed', label: 'Type' },
  { value: 'drawn', label: 'Draw' },
  { value: 'upload', label: 'Upload' },
] as const;

/**
 * Signature sheet (canvas `Sign` boards): opens on the signer's name in
 * script, one tap on Sign adopts it; Draw and Upload are the other tabs.
 * A modal on a desktop, a bottom sheet on a phone. Emits a
 * `SignatureCaptureResult` containing a PNG blob plus format metadata
 * (`font` for typed, `stroke_count` for drawn, `source_filename` for
 * upload), which is the backend's `/sign/signature` multipart body.
 */
export const SignatureCapture = forwardRef<HTMLDivElement, SignatureCaptureProps>((props, ref) => {
  const { open, kind, defaultName, email = '', onCancel, onApply, ...rest } = props;

  const [tab, setTab] = useState<SignatureCaptureFormat>('typed');
  const [typed, setTyped] = useState<string>(() =>
    computeInitialTyped({ kind, defaultName, email }),
  );
  const [strokeCount, setStrokeCount] = useState(0);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef<boolean>(false);

  const reset = useCallback(() => {
    setTab('typed');
    setTyped(computeInitialTyped({ kind, defaultName, email }));
    setStrokeCount(0);
    setUploadFile(null);
    setUploadName('');
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [defaultName, email, kind]);

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

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
      const result = await typedCaptureResult(typed, kind);
      saveTypedPreference({ email, kind, value: typed });
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

  const titleText = kind === 'signature' ? 'Your signature' : 'Your initials';
  const nameLabel = kind === 'signature' ? 'Your full name' : 'Initials';

  return (
    <SheetDialog
      open={open}
      onClose={onCancel}
      title={titleText}
      closeLabel="Cancel"
      footer={
        <Button
          iconLeft={PenLine}
          onClick={() => {
            handleApply().catch(() => {
              /* canvas export failed; the sheet stays open to try again */
            });
          }}
          disabled={!canApply}
        >
          Sign
        </Button>
      }
    >
      <div ref={ref} {...rest} style={{ display: 'contents' }} />
      <SegmentedControl
        block
        aria-label="Signature type"
        options={TAB_OPTIONS}
        value={tab}
        onChange={setTab}
      />

      {tab === 'typed' ? (
        <>
          <Pad>
            <Ink $initials={kind === 'initials'}>{typed || '—'}</Ink>
          </Pad>
          <NameField>
            <input
              aria-label={nameLabel}
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={nameLabel}
            />
          </NameField>
        </>
      ) : null}

      {tab === 'drawn' ? (
        <div>
          <Pad $draw>
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
            <PadClear>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={Undo2}
                onClick={clearDraw}
                disabled={strokeCount === 0}
              >
                Clear
              </Button>
            </PadClear>
          </Pad>
          <DrawHint>
            {strokeCount === 0
              ? 'Click and drag with your mouse or finger'
              : `${strokeCount} stroke${strokeCount === 1 ? '' : 's'}`}
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
          {uploadName ? <div>{uploadName}</div> : null}
        </UploadArea>
      ) : null}

      <Meta>Used for every signature in this document.</Meta>
      <Meta>
        <Icon icon={ShieldCheck} size={12} />
        Recorded in the audit trail when you sign
      </Meta>
    </SheetDialog>
  );
});
SignatureCapture.displayName = 'SignatureCapture';
