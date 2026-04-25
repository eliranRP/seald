import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as RP } from 'react';
import { useTheme } from 'styled-components';
import { Button } from '@/components/Button';
import { Canvas, Row, Actions, SrOnly, Wrap } from './DrawMode.styles';
import type { DrawModeProps } from './DrawMode.types';

export function DrawMode(props: DrawModeProps) {
  const { onCommit, onCancel, width = 480, height = 180 } = props;
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [strokes, setStrokes] = useState(0);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext('2d');
    if (!c) return;
    const inkColor = theme.color.ink[900];
    c.lineWidth = 2.5;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.strokeStyle = inkColor;
  }, [theme]);

  const pointerPos = (e: RP<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width === 0 ? 1 : width / rect.width;
    const scaleY = rect.height === 0 ? 1 : height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  };

  const handleDown = (e: RP<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    const c = canvas?.getContext('2d');
    if (!c) return;
    const { x, y } = pointerPos(e);
    drawingRef.current = true;
    c.beginPath();
    c.moveTo(x, y);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handleMove = (e: RP<HTMLCanvasElement>): void => {
    if (!drawingRef.current) return;
    const c = canvasRef.current?.getContext('2d');
    if (!c) return;
    const { x, y } = pointerPos(e);
    c.lineTo(x, y);
    c.stroke();
  };

  const handleUp = (): void => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    setStrokes((n) => n + 1);
  };

  const handleClear = (): void => {
    const canvas = canvasRef.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    c.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes(0);
    setAnnouncement('Signature cleared');
  };

  const handleDone = (): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const pngDataUrl = canvas.toDataURL('image/png');
    setAnnouncement('Signature captured');
    onCommit({ kind: 'drawn', pngDataUrl, strokes });
  };

  return (
    <Wrap>
      <Canvas
        ref={canvasRef}
        role="img"
        aria-label="Signature canvas. Draw with your pointer."
        width={width}
        height={height}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerLeave={handleUp}
      />
      <Row>
        <Button variant="ghost" onClick={handleClear} disabled={strokes === 0}>
          Clear
        </Button>
        <Actions>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleDone} disabled={strokes === 0}>
            Done
          </Button>
        </Actions>
      </Row>
      <SrOnly role="status" aria-live="polite">
        {announcement}
      </SrOnly>
    </Wrap>
  );
}
