import { forwardRef, useEffect, useRef, useState } from 'react';
import { Check, Plus, Tag } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { useEscapeKey } from '@/hooks/useEscapeKey';
import { tagColorFor } from '@/features/templates';
import type { TagEditorPopoverProps } from './TagEditorPopover.types';
import {
  Backdrop,
  Card,
  CreateRow,
  Empty,
  List,
  Row,
  RowCheck,
  RowDot,
  RowPill,
  SearchRow,
} from './TagEditorPopover.styles';

/**
 * L3 widget — popover that lists every known tag with a check row,
 * plus an inline "create" row when the search doesn't match. The host
 * decides where to anchor it; this implementation is a centered
 * top-anchored modal-style popover with a backdrop scrim, since the
 * design guide pins it next to a card and we don't have a clean way
 * to do anchored positioning without an FAB-grade portal solution.
 */
export const TagEditorPopover = forwardRef<HTMLDivElement, TagEditorPopoverProps>((props, ref) => {
  const { open, currentTags, allTags, onToggle, onCreate, onClose, ...rest } = props;
  const [draft, setDraft] = useState('');

  useEscapeKey(onClose, open);

  // Reset the draft each time the popover opens for a new card —
  // otherwise residual text would leak across openings.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) setDraft('');
    wasOpenRef.current = open;
  }, [open]);

  if (!open) return null;

  const lowered = draft.trim().toLowerCase();
  const visible = allTags.filter((t) => !lowered || t.toLowerCase().includes(lowered));
  const exact = allTags.find((t) => t.toLowerCase() === lowered);
  const canCreate = lowered.length > 0 && !exact;

  const submit = (): void => {
    if (canCreate) {
      onCreate(draft.trim());
      setDraft('');
      return;
    }
    const first = visible[0];
    if (first) {
      onToggle(first);
      setDraft('');
    }
  };

  return (
    <Backdrop role="presentation" onClick={onClose}>
      <Card
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Edit template tags"
        onClick={(e) => e.stopPropagation()}
        {...rest}
      >
        <SearchRow>
          <Icon icon={Tag} size={12} />
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Find or create tag…"
            aria-label="Find or create tag"
          />
        </SearchRow>

        <List role="listbox">
          {visible.map((tag) => {
            const c = tagColorFor(tag);
            const checked = currentTags.includes(tag);
            return (
              <Row
                key={tag}
                role="option"
                aria-selected={checked}
                tabIndex={0}
                onClick={() => onToggle(tag)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(tag);
                  }
                }}
              >
                <RowCheck $checked={checked} $color={c.fg} aria-hidden>
                  {checked ? <Icon icon={Check} size={10} /> : null}
                </RowCheck>
                <RowPill $bg={c.bg} $fg={c.fg}>
                  <RowDot $color={c.fg} aria-hidden />
                  {tag}
                </RowPill>
              </Row>
            );
          })}

          {visible.length === 0 && !canCreate ? <Empty>No tags yet.</Empty> : null}
        </List>

        {canCreate ? (
          <CreateRow
            role="button"
            tabIndex={0}
            onClick={() => {
              onCreate(draft.trim());
              setDraft('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onCreate(draft.trim());
                setDraft('');
              }
            }}
          >
            <Icon icon={Plus} size={12} />
            <span>Create</span>
            <RowPill $bg={tagColorFor(draft.trim()).bg} $fg={tagColorFor(draft.trim()).fg}>
              {draft.trim()}
            </RowPill>
          </CreateRow>
        ) : null}
      </Card>
    </Backdrop>
  );
});

TagEditorPopover.displayName = 'TagEditorPopover';
