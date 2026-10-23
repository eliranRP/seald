/**
 * Deterministic field suggestions for `envelopes_suggest_fields`
 * (docs/design/mcp-server.md step 9). Pure: no I/O, no writes, no model.
 * The agent applies a suggestion with `envelopes_place_fields`.
 *
 * Heuristic v1, per document set:
 * - one required `signature` per signer on the last page of the signing
 *   document (the last document, or the one the caller names), stacked
 *   upward from y = 0.78 at x = 0.1, plus a `date` to its right;
 * - optional `initials` (required: false) at the bottom right of every
 *   other page, so the signature alone satisfies send's rule;
 * - a suggestion that overlaps a placed field or an earlier suggestion is
 *   shifted up by 0.08 until it is clear, and dropped when it leaves the page.
 *
 * Only `signature`, `initials` and `date` are suggested: they are valid
 * with `fieldMetaV2` on or off, so a suggestion never needs per-kind meta.
 */

export interface SuggestSigner {
  readonly id: string;
}

export interface SuggestDocument {
  /** Present while multi-document envelopes are on. */
  readonly id: string | undefined;
  readonly pages: number;
}

export interface PlacedBox {
  readonly document_id: string | undefined;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number | null;
  readonly height: number | null;
}

export interface SuggestedField {
  readonly signer_id: string;
  readonly document_id?: string;
  readonly kind: 'signature' | 'initials' | 'date';
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly required: boolean;
}

export interface SuggestFieldsInput {
  readonly signers: readonly SuggestSigner[];
  readonly documents: readonly SuggestDocument[];
  /** Index into `documents` of the signing document; default the last. */
  readonly signingDocument?: number;
  readonly existing: readonly PlacedBox[];
  readonly maxFields: number;
}

const SIG = { x: 0.1, y: 0.78, w: 0.28, h: 0.06 } as const;
const DATE = { x: 0.42, w: 0.2, h: 0.06 } as const;
const INITIALS = { x: 0.9, y: 0.92, w: 0.08, h: 0.05, stepX: 0.1 } as const;
const SHIFT = 0.08;
// Existing fields saved without a size are treated as signature-sized.
const DEFAULT_BOX = { w: SIG.w, h: SIG.h } as const;
const EPS = 1e-9;

const round = (n: number): number => Math.round(n * 1e4) / 1e4;

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.y < b.y + b.h - EPS && b.y < a.y + a.h - EPS
  );
}

export function suggestFields(input: SuggestFieldsInput): SuggestedField[] {
  const { signers, documents, existing, maxFields } = input;
  if (signers.length === 0 || documents.length === 0) return [];
  const signIdx = input.signingDocument ?? documents.length - 1;
  const taken = existing.map((e) => ({
    doc: e.document_id,
    page: e.page,
    x: e.x,
    y: e.y,
    w: e.width ?? DEFAULT_BOX.w,
    h: e.height ?? DEFAULT_BOX.h,
  }));
  const out: SuggestedField[] = [];

  /** Place one box; null when no clear slot remains on the page. */
  const place = (
    doc: SuggestDocument,
    page: number,
    box: { x: number; y: number; w: number; h: number },
  ): { x: number; y: number } | null => {
    let y = box.y;
    while (y >= -EPS) {
      const candidate = { x: box.x, y, w: box.w, h: box.h };
      const hit = taken.some((t) => t.doc === doc.id && t.page === page && overlaps(candidate, t));
      if (!hit) {
        if (candidate.x < -EPS || candidate.x + candidate.w > 1 + EPS || y + box.h > 1 + EPS) {
          return null;
        }
        taken.push({ doc: doc.id, page, ...candidate });
        return { x: round(candidate.x), y: round(Math.max(y, 0)) };
      }
      y -= SHIFT;
    }
    return null;
  };

  const push = (
    doc: SuggestDocument,
    signer: SuggestSigner,
    kind: SuggestedField['kind'],
    page: number,
    box: { x: number; y: number; w: number; h: number },
    required: boolean,
  ): void => {
    if (out.length >= maxFields) return;
    const at = place(doc, page, box);
    if (!at) return;
    out.push({
      signer_id: signer.id,
      ...(doc.id !== undefined ? { document_id: doc.id } : {}),
      kind,
      page,
      x: at.x,
      y: at.y,
      width: box.w,
      height: box.h,
      required,
    });
  };

  const signDoc = documents[signIdx];
  // Signatures first, so initials never push them aside.
  if (signDoc && signDoc.pages >= 1) {
    signers.forEach((signer, i) => {
      const y = SIG.y - SHIFT * i;
      push(signDoc, signer, 'signature', signDoc.pages, { x: SIG.x, y, w: SIG.w, h: SIG.h }, true);
      push(signDoc, signer, 'date', signDoc.pages, { x: DATE.x, y, w: DATE.w, h: DATE.h }, true);
    });
  }
  documents.forEach((doc, d) => {
    for (let page = 1; page <= doc.pages; page++) {
      if (d === signIdx && page === doc.pages) continue;
      signers.forEach((signer, i) => {
        const x = INITIALS.x - INITIALS.stepX * (i + 1);
        push(
          doc,
          signer,
          'initials',
          page,
          { x, y: INITIALS.y - INITIALS.h, w: INITIALS.w, h: INITIALS.h },
          false,
        );
      });
    }
  });
  return out;
}
