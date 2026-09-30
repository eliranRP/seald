import type { FieldKind } from 'shared';

/**
 * MCP placement unit: PDF points from the top-left of the page as
 * displayed (CropBox with /Rotate applied, y down). Stored fields are
 * 0–1 fractions of that same page, top-left, page numbers from 1.
 */
export interface DisplayedBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** PDF user space. Origin is the lower-left of the box, y up. */
export interface PdfUserBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageSize {
  readonly page: number;
  /** Displayed width in PDF points. */
  readonly width: number;
  /** Displayed height in PDF points. */
  readonly height: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mediaBox: PdfUserBox;
  readonly cropBox: PdfUserBox;
}

export interface TextRun {
  readonly page: number;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AcroFormFieldInfo {
  readonly name: string;
  readonly page: number;
  /** PDF field type: Tx, Btn, Ch, or Sig. */
  readonly fieldType: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface DocumentInspection {
  readonly documentId: string;
  readonly pageCount: number;
  readonly pages: readonly PageSize[];
  readonly textRuns: readonly TextRun[];
  readonly acroFormFields: readonly AcroFormFieldInfo[];
}

export const FIELD_TYPE_INPUTS = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
  'email',
  'name',
] as const;

export type FieldTypeInput = (typeof FIELD_TYPE_INPUTS)[number];

export const ANCHOR_POSITIONS = ['before', 'after', 'above', 'below', 'over'] as const;
export type AnchorPosition = (typeof ANCHOR_POSITIONS)[number];

export interface SignerRef {
  readonly id: string;
  readonly name?: string;
  readonly color?: string;
}

export interface AnchorSpec {
  /** Exact substring. Matching is case-sensitive. */
  readonly text: string;
  /** 1-based index in reading order. Defaults to 1. */
  readonly occurrence?: number;
  readonly position: AnchorPosition;
  /** Extra shift in displayed points. Positive x is right, positive y is down. */
  readonly offset?: { readonly x?: number; readonly y?: number };
  /** Limit the search to this page (1-based). */
  readonly page?: number;
}

interface PlacementBase {
  readonly type: FieldTypeInput;
  readonly signer: SignerRef;
  readonly required?: boolean;
}

export interface CoordinatePlacement extends PlacementBase {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface AnchorPlacement extends PlacementBase {
  readonly anchor: AnchorSpec;
  /** Field size in displayed points. Defaults from the seal's per-kind fractions. */
  readonly w?: number;
  readonly h?: number;
}

export interface AcroFormPlacement extends PlacementBase {
  readonly acroformField: string;
}

export type PlacementInput = CoordinatePlacement | AnchorPlacement | AcroFormPlacement;

/**
 * Envelope field row plus the facts the preview loop needs.
 * `x`, `y`, `width`, `height` are the stored 0–1 fractions.
 * `box` is that rectangle denormalized back to displayed points.
 */
export interface PlacedField {
  readonly id: string;
  readonly signer_id: string;
  readonly signer_name: string;
  readonly signer_color: string;
  readonly kind: FieldKind;
  readonly link_id: string | null;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly required: boolean;
  readonly box: DisplayedBox;
}

export type FieldIssueCode =
  | 'out_of_bounds'
  | 'too_small'
  | 'overlap'
  | 'missing_signature'
  | 'anchor_not_found'
  | 'page_not_found'
  | 'covers_text';

export interface FieldIssue {
  readonly code: FieldIssueCode;
  readonly severity: 'error' | 'warning';
  readonly fieldId: string | null;
  readonly signerId: string | null;
  readonly message: string;
  readonly page: number | null;
  readonly box: DisplayedBox | null;
}

export interface NearestText {
  readonly text: string;
  readonly distance: number;
  readonly box: DisplayedBox;
}

export interface FieldReport {
  readonly id: string;
  readonly kind: FieldKind;
  readonly signerId: string;
  readonly page: number;
  readonly box: DisplayedBox;
  readonly nearestText: NearestText | null;
}

export interface ValidationReport {
  readonly ok: boolean;
  readonly errors: readonly FieldIssue[];
  readonly warnings: readonly FieldIssue[];
  readonly fields: readonly FieldReport[];
}

export interface PlacementResult {
  readonly fields: readonly PlacedField[];
  readonly errors: readonly FieldIssue[];
  readonly validation: ValidationReport;
}

export interface FieldPatch {
  readonly type?: FieldTypeInput;
  readonly signer?: SignerRef;
  readonly required?: boolean;
  readonly page?: number;
  readonly x?: number;
  readonly y?: number;
  readonly w?: number;
  readonly h?: number;
  readonly anchor?: AnchorSpec;
  readonly acroformField?: string;
}

export interface PreviewPage {
  readonly page: number;
  readonly png: Buffer;
  readonly width: number;
  readonly height: number;
  readonly scale: number;
}
