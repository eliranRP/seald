import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { Undo2 } from 'lucide-react';
import { seald } from '@/styles/theme';
import { Button } from '@/components/Button';
import { PadAction, SigCanvas, SigPad } from './SettingsPage.styles';

const W = 600;
const H = 160;

export interface SignatureDrawPadProps {
  /** The saved drawing as a PNG data URL, painted onto the pad on mount. */
  readonly value: string | null;
  /** Called with the PNG after each stroke, and with null on Clear. */
  readonly onChange: (png: string | null) => void;
}

/** A pointer-driven pad: draw with mouse, pen or finger, Clear to start over. */
export function SignatureDrawPad({ value, onChange }: SignatureDrawPadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  // Paint the saved drawing once, on mount; later strokes live on the canvas.
  const initial = useRef(value);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const saved = initial.current;
    if (!canvas || !ctx || !saved) return;
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0, W, H);
    img.src = saved;
  }, []);

  function point(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / (rect.width || W)) * W,
      y: ((e.clientY - rect.top) / (rect.height || H)) * H,
    };
  }

  function start(e: ReactPointerEvent<HTMLCanvasElement>): void {
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.strokeStyle = seald.color.ink[900];
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext('2d');
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function end(e: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(e.currentTarget.toDataURL('image/png'));
  }

  function clear(): void {
    const canvas = canvasRef.current;
    canvas?.getContext('2d')?.clearRect(0, 0, W, H);
    onChange(null);
  }

  return (
    <SigPad>
      <SigCanvas
        ref={canvasRef}
        width={W}
        height={H}
        role="img"
        aria-label="Signature pad: draw with your mouse, pen or finger"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
      <PadAction>
        <Button variant="ghost" size="sm" iconLeft={Undo2} onClick={clear}>
          Clear
        </Button>
      </PadAction>
    </SigPad>
  );
}
