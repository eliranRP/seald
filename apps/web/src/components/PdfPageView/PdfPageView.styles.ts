import styled from 'styled-components';

export const Wrap = styled.div`
  position: relative;
  display: block;
  background: ${({ theme }) => theme.color.bg.surface};
  line-height: 0;
`;

/**
 * The raster target pdfjs paints into. Backing-store dims are set via the
 * intrinsic `width`/`height` attrs (HiDPI-aware), while CSS width/height
 * hold the layout size so field coordinates stay in a stable CSS pixel
 * space.
 */
export const PageCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: auto;
`;

export const Placeholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  color: ${({ theme }) => theme.color.fg[3]};
  background: ${({ theme }) => theme.color.ink[50]};
  width: 100%;
  height: 100%;
`;

/**
 * Absolutely-positioned overlay that sits on top of the canvas while the page
 * is still rasterizing. Uses `pointer-events: none` so it never blocks drop
 * targets or the marquee mousedown on the canvas beneath it.
 */
export const LoadingOverlay = styled.div`
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: ${({ theme }) => theme.space[2]};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[3]};
  font-family: ${({ theme }) => theme.font.sans};
  font-size: 12px;
  pointer-events: none;
`;

/**
 * Minimal CSS-only spinner so we don't pull in an SVG dep or ship a GIF.
 * Animates an indigo border-arc around a transparent circle.
 */
export const Spinner = styled.div`
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2.5px solid ${({ theme }) => theme.color.ink[100]};
  border-top-color: ${({ theme }) => theme.color.indigo[600]};
  animation: pdf-page-spin 0.8s linear infinite;

  @keyframes pdf-page-spin {
    to {
      transform: rotate(360deg);
    }
  }
`;
