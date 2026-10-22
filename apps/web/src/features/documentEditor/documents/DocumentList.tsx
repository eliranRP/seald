import { forwardRef, useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, HTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { checkPdfFiles, MAX_DRAFT_DOCUMENTS, moveItem } from './model';
import {
  AddRow,
  Count,
  Grip,
  Header,
  Hint,
  HiddenInput,
  IconButton,
  List,
  Meta,
  Name,
  Notice,
  Root,
  Row,
  SelectButton,
  Title,
  VisuallyHidden,
} from './DocumentList.styles';

export interface DocumentListItem {
  readonly id: string;
  readonly title: string;
  readonly pages: number | null;
}

export interface DocumentListProps extends Omit<HTMLAttributes<HTMLElement>, 'onSelect'> {
  readonly documents: ReadonlyArray<DocumentListItem>;
  /** Id of the document the editor is showing; rendered as the current one. */
  readonly activeId?: string | undefined;
  readonly onSelect?: ((id: string) => void) | undefined;
  /** Fires with every id in the new order after a drag or a Move button. */
  readonly onReorder?: ((orderedIds: ReadonlyArray<string>) => void) | undefined;
  /** Hidden while only one document is left (the last one cannot be removed). */
  readonly onRemove?: ((id: string) => void) | undefined;
  /** Validated PDFs from the "Add document" picker. */
  readonly onAddFiles?: ((files: ReadonlyArray<File>) => void) | undefined;
  /** Opens the Google Drive picker; omit to hide the button. */
  readonly onAddFromDrive?: (() => void) | undefined;
  readonly maxDocuments?: number | undefined;
}

/**
 * Ordered list of the PDFs in a draft envelope (WP-04, flag
 * `multiDocumentEnvelopes`): pick the one to edit, reorder (drag a row, or
 * use the Move up / Move down buttons from the keyboard), remove, and add
 * more. Rows are keyed by document id, never by index (rule 4.3). The list
 * is presentational: the owner applies the new order.
 */
export const DocumentList = forwardRef<HTMLElement, DocumentListProps>((props, ref) => {
  const {
    documents,
    activeId,
    onSelect,
    onReorder,
    onRemove,
    onAddFiles,
    onAddFromDrive,
    maxDocuments = MAX_DRAFT_DOCUMENTS,
    ...rest
  } = props;

  const reactId = useId();
  const inputId = `${reactId}-files`;
  const rootRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  // Keyboard focus follows the moved row: the DOM node can lose focus when
  // the list reorders, so re-focus the same direction button afterwards.
  const refocus = useRef<{ readonly id: string; readonly dir: 'up' | 'down' } | null>(null);

  const setRefs = useCallback(
    (node: HTMLElement | null): void => {
      rootRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  useEffect(() => {
    const target = refocus.current;
    if (target === null) return;
    refocus.current = null;
    const root = rootRef.current;
    if (root === null) return;
    const pick = (dir: 'up' | 'down'): HTMLButtonElement | null =>
      root.querySelector<HTMLButtonElement>(`[data-doc-move="${target.id}:${dir}"]`);
    const first = pick(target.dir);
    if (first !== null && !first.disabled) first.focus();
    else pick(target.dir === 'up' ? 'down' : 'up')?.focus();
  }, [documents]);

  const total = documents.length;
  const reorderCapable = onReorder !== undefined && total > 1;

  const commitMove = useCallback(
    (from: number, to: number, dir: 'up' | 'down' | null): void => {
      const moved = documents[from];
      if (moved === undefined || from === to || onReorder === undefined) return;
      const next = moveItem(documents, from, to);
      if (dir !== null) refocus.current = { id: moved.id, dir };
      setAnnouncement(`Moved ${moved.title} to position ${String(to + 1)} of ${String(total)}.`);
      onReorder(next.map((d) => d.id));
    },
    [documents, onReorder, total],
  );

  const handleDragStart = (e: DragEvent<HTMLLIElement>, id: string): void => {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  const handleDragOver = (e: DragEvent<HTMLLIElement>, id: string): void => {
    if (dragId === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overId !== id) setOverId(id);
  };
  const handleDrop = (e: DragEvent<HTMLLIElement>, id: string): void => {
    e.preventDefault();
    const from = documents.findIndex((d) => d.id === dragId);
    const to = documents.findIndex((d) => d.id === id);
    setDragId(null);
    setOverId(null);
    if (from >= 0 && to >= 0) commitMove(from, to, null);
  };
  const handleDragEnd = (): void => {
    setDragId(null);
    setOverId(null);
  };

  const handlePick = (e: ChangeEvent<HTMLInputElement>): void => {
    const picked = Array.from(e.target.files ?? []);
    // Allow picking the same file again later.
    e.target.value = '';
    if (picked.length === 0) return;
    const { ok, rejected } = checkPdfFiles(picked);
    const room = Math.max(0, maxDocuments - total);
    const accepted = ok.slice(0, room);
    const messages: string[] = [];
    for (const r of rejected) {
      messages.push(
        r.reason === 'type' ? `${r.name} is not a PDF.` : `${r.name} is larger than 25 MB.`,
      );
    }
    if (ok.length > accepted.length) {
      messages.push(`An envelope holds up to ${String(maxDocuments)} documents.`);
    }
    setProblem(messages.length > 0 ? messages.join(' ') : null);
    if (accepted.length > 0) onAddFiles?.(accepted);
  };

  const atLimit = total >= maxDocuments;
  const canRemove = onRemove !== undefined && total > 1;

  return (
    <Root {...rest} ref={setRefs} aria-label="Documents">
      <Header>
        <Title>Documents</Title>
        <Count>
          {total}/{maxDocuments}
        </Count>
      </Header>
      <List>
        {documents.map((doc, index) => {
          const active = doc.id === activeId;
          return (
            <Row
              key={doc.id}
              $active={active}
              $dragging={dragId === doc.id}
              $dropTarget={overId === doc.id && dragId !== doc.id}
              draggable={reorderCapable}
              onDragStart={(e) => handleDragStart(e, doc.id)}
              onDragOver={(e) => handleDragOver(e, doc.id)}
              onDrop={(e) => handleDrop(e, doc.id)}
              onDragEnd={handleDragEnd}
            >
              {reorderCapable ? (
                <Grip aria-hidden>
                  <GripVertical size={14} />
                </Grip>
              ) : null}
              <SelectButton
                type="button"
                aria-current={active ? 'true' : undefined}
                aria-label={`${doc.title}, document ${String(index + 1)} of ${String(total)}`}
                onClick={() => onSelect?.(doc.id)}
              >
                <Name>{doc.title}</Name>
                <Meta>
                  {doc.pages === null
                    ? '—'
                    : `${String(doc.pages)} ${doc.pages === 1 ? 'page' : 'pages'}`}
                </Meta>
              </SelectButton>
              {reorderCapable ? (
                <>
                  <IconButton
                    type="button"
                    data-doc-move={`${doc.id}:up`}
                    aria-label={`Move ${doc.title} up`}
                    disabled={index === 0}
                    onClick={() => commitMove(index, index - 1, 'up')}
                  >
                    <ArrowUp size={14} aria-hidden />
                  </IconButton>
                  <IconButton
                    type="button"
                    data-doc-move={`${doc.id}:down`}
                    aria-label={`Move ${doc.title} down`}
                    disabled={index === total - 1}
                    onClick={() => commitMove(index, index + 1, 'down')}
                  >
                    <ArrowDown size={14} aria-hidden />
                  </IconButton>
                </>
              ) : null}
              {canRemove ? (
                <IconButton
                  type="button"
                  aria-label={`Remove ${doc.title}`}
                  onClick={() => onRemove?.(doc.id)}
                >
                  <X size={14} aria-hidden />
                </IconButton>
              ) : null}
            </Row>
          );
        })}
      </List>
      {onAddFiles || onAddFromDrive ? (
        <AddRow>
          {onAddFiles ? (
            <Button
              variant="secondary"
              size="sm"
              iconLeft={Plus}
              disabled={atLimit}
              onClick={() => inputRef.current?.click()}
            >
              Add document
            </Button>
          ) : null}
          {onAddFromDrive ? (
            <Button variant="secondary" size="sm" disabled={atLimit} onClick={onAddFromDrive}>
              Add from Google Drive
            </Button>
          ) : null}
        </AddRow>
      ) : null}
      {atLimit ? <Hint>An envelope holds up to {maxDocuments} documents.</Hint> : null}
      {problem !== null ? <Notice role="alert">{problem}</Notice> : null}
      {onAddFiles ? (
        <HiddenInput
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept="application/pdf"
          aria-label="Choose PDF files to add"
          tabIndex={-1}
          onChange={handlePick}
        />
      ) : null}
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
    </Root>
  );
});

DocumentList.displayName = 'DocumentList';
