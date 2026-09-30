import type {
  PlacementBox,
  PlacementKind,
  PlacementNearestText,
  PlacementValidation,
} from 'shared';

/**
 * Internal displayed-page box. `w` and `h` match the swap-point helpers
 * in displayed-page.ts. The public contract uses `width` and `height`.
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
  readonly width: number;
  readonly height: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mediaBox: PdfUserBox;
  readonly cropBox: PdfUserBox;
}

export const PLACEMENT_UNITS = 'pdf_points_top_left_displayed';
export const TEXT_LINE_CAP = 2000;
export const INSPECT_PAGE_LIMIT = 50;

export const FORM_WIDGET_TYPES = [
  'Signature',
  'Text',
  'CheckBox',
  'RadioButton',
  'PushButton',
  'ComboBox',
  'ListBox',
] as const;

export type FormWidgetType = (typeof FORM_WIDGET_TYPES)[number];

export interface InspectPage {
  readonly page: number;
  readonly view_width: number;
  readonly view_height: number;
  readonly rotation: 0 | 90 | 180 | 270;
  readonly mediabox: PdfUserBox;
  readonly cropbox: PdfUserBox;
}

export interface InspectTextItem {
  readonly page: number;
  readonly text: string;
  readonly box: PlacementBox;
}

export interface InspectFormField {
  readonly page: number;
  readonly name: string;
  readonly type: FormWidgetType;
  readonly box: PlacementBox;
  readonly suggested_kind: PlacementKind;
}

export interface InspectDocumentResult {
  readonly page_count: number;
  readonly units: typeof PLACEMENT_UNITS;
  readonly pages: readonly InspectPage[];
  readonly text: readonly InspectTextItem[];
  readonly text_granularity: 'word' | 'line';
  readonly next_cursor: string | null;
  readonly form_fields: readonly InspectFormField[];
}

export interface PlacementBoxInput {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width?: number;
  readonly height?: number;
}

export interface AnchorLocator {
  readonly text: string;
  readonly occurrence?: number;
  readonly page?: number;
  readonly match?: 'exact' | 'case_insensitive';
  readonly position?: 'right' | 'left' | 'above' | 'below' | 'over';
  readonly gap?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly width?: number;
  readonly height?: number;
}

export interface FormFieldLocator {
  readonly name: string;
  readonly page?: number;
}

export interface PlacementFieldInput {
  readonly signer_id: string;
  readonly kind?: string;
  readonly required?: boolean;
  readonly label?: string;
  readonly client_ref?: string;
  readonly box?: PlacementBoxInput;
  readonly anchor?: AnchorLocator;
  readonly form_field?: FormFieldLocator;
}

export interface NormalizedPlacement {
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PlacementFieldOutput {
  readonly id: string | null;
  readonly client_ref: string | null;
  readonly label: string | null;
  readonly signer_id: string;
  readonly kind: PlacementKind;
  readonly required: boolean;
  readonly page: number;
  readonly box: PlacementBox;
  readonly normalized: NormalizedPlacement;
  readonly source: string;
  readonly nearest_text: PlacementNearestText | null;
}

export interface PlaceFieldsResult {
  readonly fields: readonly PlacementFieldOutput[];
  readonly report: PlacementValidation;
  readonly persisted: boolean;
}

export interface FieldUpdateInput {
  readonly field_id: string;
  readonly dx?: number;
  readonly dy?: number;
  readonly box?: PlacementBoxInput;
  readonly width?: number;
  readonly height?: number;
  readonly kind?: string;
  readonly signer_id?: string;
  readonly required?: boolean;
}

export type PlacementMode = 'replace' | 'append';
