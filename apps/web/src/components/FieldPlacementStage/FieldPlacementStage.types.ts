import type { PDFDocumentProxy } from 'pdfjs-dist';

/** A stored field: fractions of the displayed page, top-left origin. */
export interface PlacementFractionField {
  readonly id: string;
  readonly kind: string;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FieldPlacementStageProps {
  readonly pdfDoc: PDFDocumentProxy;
  /** CSS width of each page. Height comes from that page's own viewport. */
  readonly canvasWidth: number;
  readonly fields: ReadonlyArray<PlacementFractionField>;
  /**
   * Which product surface this stage is standing in for. The e2e harness
   * keys screenshots and box queries off this value.
   */
  readonly surface: 'preview' | 'signed';
  /**
   * 1 draws every page's boxes against page 1's aspect. 2 uses each
   * page's viewport. Preview of a new draft omits this and uses 2.
   */
  readonly placementVersion?: 1 | 2;
}
