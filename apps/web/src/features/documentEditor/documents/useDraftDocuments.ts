import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { PlacedFieldValue } from '@/components/PlacedField/PlacedField.types';
import { CANVAS_HEIGHT_FALLBACK, CANVAS_WIDTH } from '@/lib/canvas-coords';
import type { AppDocument } from '@/lib/mockApi';
import { readPdfInfo } from '@/lib/pdf';
import {
  MAX_DRAFT_DOCUMENTS,
  fieldsForDocument,
  mergeDocumentFields,
  newPartId,
  removeDocumentFields,
  stampFirstDocument,
  titleFromFile,
} from './model';
import type { DraftDocumentPart } from './model';

export interface UseDraftDocumentsArgs {
  /** Off (flag `multiDocumentEnvelopes` off, or no draft): every output is the legacy single-document one. */
  readonly enabled: boolean;
  readonly draft: AppDocument | undefined;
  readonly update: (id: string, patch: Partial<AppDocument>) => void;
  /**
   * Canvas height of the document currently on screen. Read when the first
   * extra PDF is added, to record the first part's aspect ratio. A ref
   * because the canvas height itself depends on which part is active.
   */
  readonly canvasHeightRef: RefObject<number>;
}

export interface DraftDocumentListItem {
  readonly id: string;
  readonly title: string;
  readonly pages: number;
}

export interface UseDraftDocuments {
  /** The ordered parts; empty while the draft holds a single PDF. */
  readonly parts: ReadonlyArray<DraftDocumentPart>;
  /** More than one document: the switcher shows and fields are per document. */
  readonly multi: boolean;
  readonly activePart: DraftDocumentPart | undefined;
  readonly setActiveId: (id: string) => void;
  /** Rows for the document list (one row for a single-PDF draft). */
  readonly listItems: ReadonlyArray<DraftDocumentListItem>;
  readonly activeListId: string | undefined;
  /** Fields of the document on screen (all of them when not `multi`). */
  readonly visibleFields: ReadonlyArray<PlacedFieldValue>;
  readonly onFieldsChange: (next: ReadonlyArray<PlacedFieldValue>) => void;
  readonly addFiles: (files: ReadonlyArray<File>) => Promise<ReadonlyArray<string>>;
  readonly reorder: (orderedIds: ReadonlyArray<string>) => void;
  readonly remove: (id: string) => void;
  /** Per-document field counts for the switcher's meta line. */
  readonly fieldCountById: ReadonlyMap<string, number>;
}

const PRIMARY_LIST_ID = 'primary';

function mirrorFirst(parts: ReadonlyArray<DraftDocumentPart>): Partial<AppDocument> {
  const first = parts[0];
  return first ? { file: first.file, totalPages: first.totalPages } : {};
}

/**
 * Local state of a multi-document draft (WP-04, flag `multiDocumentEnvelopes`).
 * A draft with one PDF is left exactly as it was (no parts, no
 * `documentId` on fields). Adding a second PDF turns it into an ordered
 * list of parts; fields then carry the `documentId` of the part they sit
 * on, and the editor is handed only the document on screen. Removing back
 * down to one PDF restores the legacy shape.
 */
export function useDraftDocuments(args: UseDraftDocumentsArgs): UseDraftDocuments {
  const { enabled, draft, update, canvasHeightRef } = args;
  const parts = useMemo(
    () => (enabled ? (draft?.documents ?? []) : []),
    [enabled, draft?.documents],
  );
  const multi = parts.length > 1;
  const [requestedId, setRequestedId] = useState<string | null>(null);
  const activePart = multi ? (parts.find((p) => p.id === requestedId) ?? parts[0]) : undefined;

  // Several adds can land before React re-renders; always build on the latest draft.
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const allFields = draft?.fields;
  const visibleFields = useMemo<ReadonlyArray<PlacedFieldValue>>(() => {
    if (!allFields) return [];
    if (!multi || !activePart) return allFields;
    return fieldsForDocument(allFields, parts, activePart.id);
  }, [allFields, multi, activePart, parts]);

  const onFieldsChange = useCallback(
    (next: ReadonlyArray<PlacedFieldValue>): void => {
      const current = draftRef.current;
      if (!current) return;
      if (multi && activePart) {
        update(current.id, {
          fields: mergeDocumentFields(current.fields, parts, activePart.id, next),
        });
        return;
      }
      update(current.id, { fields: next });
    },
    [multi, activePart, parts, update],
  );

  const addFiles = useCallback(
    async (files: ReadonlyArray<File>): Promise<ReadonlyArray<string>> => {
      const failures: string[] = [];
      const added: DraftDocumentPart[] = [];
      for (const file of files) {
        try {
          const info = await readPdfInfo(file);
          added.push({
            id: newPartId(),
            title: titleFromFile(file),
            file,
            totalPages: Math.max(1, info.pages),
            aspect: info.aspect,
          });
        } catch {
          failures.push(file.name);
        }
      }
      const current = draftRef.current;
      if (!current || added.length === 0) return failures;

      const existing = current.documents ?? [];
      let base: ReadonlyArray<DraftDocumentPart> = existing;
      let fields = current.fields;
      if (existing.length === 0) {
        if (!current.file) return failures;
        const first: DraftDocumentPart = {
          id: newPartId(),
          title: current.title,
          file: current.file,
          totalPages: current.totalPages,
          aspect: canvasHeightRef.current > 0 ? canvasHeightRef.current / CANVAS_WIDTH : 1,
        };
        base = [first];
        fields = stampFirstDocument(current.fields, first.id);
      }
      const next = [...base, ...added].slice(0, MAX_DRAFT_DOCUMENTS);
      const firstNew = next[base.length];
      update(current.id, { documents: next, fields, ...mirrorFirst(next) });
      if (firstNew) setRequestedId(firstNew.id);
      return failures;
    },
    [update, canvasHeightRef],
  );

  const reorder = useCallback(
    (orderedIds: ReadonlyArray<string>): void => {
      const current = draftRef.current;
      const list = current?.documents;
      if (!current || !list) return;
      const byId = new Map(list.map((p) => [p.id, p] as const));
      const next = orderedIds
        .map((id) => byId.get(id))
        .filter((p): p is DraftDocumentPart => p !== undefined);
      if (next.length !== list.length) return;
      // The document on screen stays on screen: pin it before the order changes.
      if (activePart) setRequestedId(activePart.id);
      update(current.id, { documents: next, ...mirrorFirst(next) });
    },
    [update, activePart],
  );

  const remove = useCallback(
    (id: string): void => {
      const current = draftRef.current;
      const list = current?.documents;
      if (!current || !list || list.length < 2) return;
      const next = list.filter((p) => p.id !== id);
      if (next.length === list.length) return;
      const kept = removeDocumentFields(current.fields, list, id);
      const only = next[0];
      if (next.length === 1 && only) {
        // Back to a single PDF: restore the legacy shape.
        update(current.id, {
          documents: undefined,
          fields: kept.map((f) =>
            f.documentId === undefined ? f : { ...f, documentId: undefined },
          ),
          ...mirrorFirst(next),
        });
        return;
      }
      update(current.id, { documents: next, fields: kept, ...mirrorFirst(next) });
    },
    [update],
  );

  const listItems = useMemo<ReadonlyArray<DraftDocumentListItem>>(() => {
    if (parts.length > 0) {
      return parts.map((p) => ({ id: p.id, title: p.title, pages: p.totalPages }));
    }
    if (!enabled || !draft) return [];
    return [{ id: PRIMARY_LIST_ID, title: draft.title, pages: draft.totalPages }];
  }, [enabled, draft, parts]);

  const fieldCountById = useMemo(() => {
    const counts = new Map<string, number>();
    if (!allFields) return counts;
    for (const f of allFields) {
      const id = f.documentId ?? parts[0]?.id;
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [allFields, parts]);

  return {
    parts,
    multi,
    activePart,
    setActiveId: setRequestedId,
    listItems,
    activeListId: activePart?.id ?? listItems[0]?.id ?? undefined,
    visibleFields,
    onFieldsChange,
    addFiles,
    reorder,
    remove,
    fieldCountById,
  };
}

/** Canvas height (px) for a part, from its page-1 aspect ratio. */
export function canvasHeightOf(part: DraftDocumentPart): number {
  return Number.isFinite(part.aspect) && part.aspect > 0
    ? CANVAS_WIDTH * part.aspect
    : CANVAS_HEIGHT_FALLBACK;
}
