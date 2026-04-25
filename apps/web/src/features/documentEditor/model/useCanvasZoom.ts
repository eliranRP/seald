import { useCallback, useState } from 'react';
import { ZOOM_DEFAULT, ZOOM_MAX, ZOOM_MIN, ZOOM_STEP, clampZoom } from './lib';

interface UseCanvasZoomReturn {
  readonly zoom: number;
  readonly zoomIn: () => void;
  readonly zoomOut: () => void;
  readonly resetZoom: () => void;
  readonly zoomInDisabled: boolean;
  readonly zoomOutDisabled: boolean;
}

/**
 * Canvas zoom state — applied via CSS transform on the scaler wrapper so
 * the PDF canvas + every field + marquee + snap guides scale together.
 * The page divides incoming pointer coords by `zoom` to stay in the
 * native (pre-transform) coordinate space.
 */
export function useCanvasZoom(): UseCanvasZoomReturn {
  const [zoom, setZoom] = useState<number>(ZOOM_DEFAULT);
  const zoomIn = useCallback(() => setZoom((z) => clampZoom(z + ZOOM_STEP)), []);
  const zoomOut = useCallback(() => setZoom((z) => clampZoom(z - ZOOM_STEP)), []);
  const resetZoom = useCallback(() => setZoom(ZOOM_DEFAULT), []);
  return {
    zoom,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomInDisabled: zoom >= ZOOM_MAX - 1e-6,
    zoomOutDisabled: zoom <= ZOOM_MIN + 1e-6,
  };
}
