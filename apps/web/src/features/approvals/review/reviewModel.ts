import { seald } from '@/styles/theme';
import { CANVAS_HEIGHT_FALLBACK, CANVAS_WIDTH } from '@/lib/canvas-coords';
import type { Envelope, EnvelopeField, EnvelopeSigner } from '@/features/envelopes';
import type { FieldKind } from '@/types/sealdTypes';

/** One step of the guided review: a single page of one document. */
export interface ReviewPage {
  /** 1-based position across every document. */
  readonly index: number;
  /** Absent on a single-document envelope that predates the document list. */
  readonly documentId: string | undefined;
  readonly documentTitle: string;
  /** 1-based page inside its document. */
  readonly page: number;
  /** True when the envelope has more than one document. */
  readonly multiDocument: boolean;
}

export interface ReviewSigner {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface SignerSummary extends ReviewSigner {
  readonly fieldCount: number;
  /** Global page numbers (the "1 / 3" numbers) that hold this signer's fields. */
  readonly pages: ReadonlyArray<number>;
}

export const FIELD_LABELS: Readonly<Record<FieldKind, string>> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
  email: 'Email',
  name: 'Name',
  number: 'Number',
  radio: 'Radio',
  dropdown: 'Dropdown',
};

/** Shown when a field has no usable colour (no signer, or an unknown one). */
const FALLBACK_COLOR = seald.color.ink[400];

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase() || '?';
}

/**
 * Every page of every document, in order. A single-document envelope with no
 * document list uses the envelope title and `original_pages`, falling back to
 * the highest page a field sits on, and at least one page.
 */
export function buildReviewPages(envelope: Envelope): ReadonlyArray<ReviewPage> {
  const documents = [...(envelope.documents ?? [])].sort((a, b) => a.ord - b.ord);
  const highestFieldPage = envelope.fields.reduce((max, f) => Math.max(max, f.page), 0);
  const sources =
    documents.length > 0
      ? documents.map((d) => ({
          id: d.id as string | undefined,
          title: d.title,
          pages: d.original_pages ?? 0,
        }))
      : [
          {
            id: undefined as string | undefined,
            title: envelope.title,
            pages: envelope.original_pages ?? 0,
          },
        ];
  const multiDocument = sources.length > 1;
  const pages: ReviewPage[] = [];
  sources.forEach((source) => {
    const known = source.pages > 0 ? source.pages : 0;
    const fromFields =
      documents.length > 0
        ? Math.max(
            0,
            ...envelope.fields
              .filter((f) => (f.document_id ?? documents[0]?.id) === source.id)
              .map((f) => f.page),
          )
        : highestFieldPage;
    const count = Math.max(known, fromFields, 1);
    for (let page = 1; page <= count; page += 1) {
      pages.push({
        index: pages.length + 1,
        documentId: source.id,
        documentTitle: source.title,
        page,
        multiDocument,
      });
    }
  });
  return pages;
}

/** Fields on one review page. A field with no `document_id` belongs to the first document. */
export function fieldsOnPage(envelope: Envelope, target: ReviewPage): ReadonlyArray<EnvelopeField> {
  const firstDocumentId = envelope.documents?.[0]?.id;
  return envelope.fields.filter((f) => {
    if (f.page !== target.page) return false;
    if (target.documentId === undefined) return true;
    return (f.document_id ?? firstDocumentId) === target.documentId;
  });
}

export function signerFor(
  signers: ReadonlyArray<EnvelopeSigner>,
  signerId: string,
): ReviewSigner | undefined {
  const found = signers.find((s) => s.id === signerId);
  return found ? { id: found.id, name: found.name || found.email, color: found.color } : undefined;
}

export function colorOf(signer: ReviewSigner | undefined): string {
  return signer?.color || FALLBACK_COLOR;
}

/** Per signer: colour, name, field count and the pages the fields are on. */
export function summarizeSigners(
  envelope: Envelope,
  pages: ReadonlyArray<ReviewPage>,
): ReadonlyArray<SignerSummary> {
  const pageIndexByField = new Map<string, number>();
  for (const page of pages) {
    for (const field of fieldsOnPage(envelope, page)) pageIndexByField.set(field.id, page.index);
  }
  return envelope.signers.map((signer) => {
    const own = envelope.fields.filter((f) => f.signer_id === signer.id);
    const onPages = own
      .map((f) => pageIndexByField.get(f.id))
      .filter((n): n is number => n !== undefined);
    return {
      id: signer.id,
      name: signer.name || signer.email,
      color: signer.color,
      fieldCount: own.length,
      pages: [...new Set(onPages)].sort((a, b) => a - b),
    };
  });
}

/** "page 2", "pages 1, 3" or "no pages". */
export function pagesLabel(pages: ReadonlyArray<number>): string {
  if (pages.length === 0) return 'no pages';
  return `${pages.length === 1 ? 'page' : 'pages'} ${pages.join(', ')}`;
}

/** Field counts per global page index, for the thumbnail rail badges. */
export function fieldCountByPage(
  envelope: Envelope,
  pages: ReadonlyArray<ReviewPage>,
): Readonly<Record<number, number>> {
  const counts: Record<number, number> = {};
  for (const page of pages) counts[page.index] = fieldsOnPage(envelope, page).length;
  return counts;
}

export interface FieldBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_SIZE: Readonly<Record<FieldKind, { readonly w: number; readonly h: number }>> = {
  signature: { w: 0.28, h: 0.07 },
  initials: { w: 0.1, h: 0.05 },
  date: { w: 0.18, h: 0.04 },
  text: { w: 0.28, h: 0.04 },
  checkbox: { w: 0.04, h: 0.03 },
  email: { w: 0.28, h: 0.04 },
  name: { w: 0.28, h: 0.04 },
  number: { w: 0.18, h: 0.04 },
  radio: { w: 0.04, h: 0.03 },
  dropdown: { w: 0.28, h: 0.04 },
};

function asFraction(value: number, canvasPx: number): number {
  // The API stores 0-1 fractions. A value above 1 is a legacy pixel
  // coordinate on the fixed-size editor canvas (see denormalizeCoord).
  return value > 1 ? value / canvasPx : value;
}

/** Percent box inside the page, from a field's stored coordinates. */
export function fieldBox(field: EnvelopeField): FieldBox {
  const fallback = DEFAULT_SIZE[field.kind];
  const width = field.width ? asFraction(field.width, CANVAS_WIDTH) : fallback.w;
  const height = field.height ? asFraction(field.height, CANVAS_HEIGHT_FALLBACK) : fallback.h;
  return {
    left: asFraction(field.x, CANVAS_WIDTH) * 100,
    top: asFraction(field.y, CANVAS_HEIGHT_FALLBACK) * 100,
    width: width * 100,
    height: height * 100,
  };
}
