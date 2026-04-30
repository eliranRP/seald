import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Search, Tag } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { tagColorFor } from '@/features/templates';
import {
  TagFilterAnchor,
  TagFilterCheck,
  TagFilterClearButton,
  TagFilterCount,
  TagFilterCountBadge,
  TagFilterEmpty,
  TagFilterList,
  TagFilterName,
  TagFilterPanel,
  TagFilterRow,
  TagFilterSearchRow,
  TagFilterTrigger,
} from './TemplatesListPage.styles';

export interface TagFilterMenuProps {
  readonly allTags: ReadonlyArray<string>;
  readonly counts: Readonly<Record<string, number>>;
  readonly selected: ReadonlyArray<string>;
  readonly onToggle: (tag: string) => void;
  readonly onClear: () => void;
}

/**
 * L3 widget — popover trigger ("Tags") that opens a searchable list of
 * the unique tags currently in the template set. Clicking a row
 * toggles its membership in the active filter; the parent owns the
 * `selected` list. Closes on outside-click + Escape.
 */
export function TagFilterMenu({
  allTags,
  counts,
  selected,
  onToggle,
  onClear,
}: TagFilterMenuProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e: MouseEvent): void => {
      const node = ref.current;
      if (node && e.target instanceof Node && !node.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const lowered = query.trim().toLowerCase();
  const visible = allTags.filter((t) => !lowered || t.toLowerCase().includes(lowered));
  const sorted = [...visible].sort((a, b) => {
    const ca = counts[a] ?? 0;
    const cb = counts[b] ?? 0;
    return cb - ca || a.localeCompare(b);
  });

  return (
    <TagFilterAnchor ref={ref}>
      <TagFilterTrigger
        type="button"
        $active={selected.length > 0}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Icon icon={Tag} size={13} />
        Tags
        {selected.length > 0 ? <TagFilterCount>{selected.length}</TagFilterCount> : null}
        <Icon icon={ChevronDown} size={12} />
      </TagFilterTrigger>

      {open ? (
        <TagFilterPanel role="listbox" aria-label="Filter by tag">
          <TagFilterSearchRow>
            <Icon icon={Search} size={12} />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tags…"
              aria-label="Filter tags"
            />
            {selected.length > 0 ? (
              <TagFilterClearButton type="button" onClick={onClear}>
                Clear
              </TagFilterClearButton>
            ) : null}
          </TagFilterSearchRow>
          <TagFilterList>
            {sorted.map((tag) => {
              const c = tagColorFor(tag);
              const checked = selected.includes(tag);
              return (
                <TagFilterRow
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
                  <TagFilterCheck $checked={checked} $color={c.fg} aria-hidden>
                    {checked ? <Icon icon={Check} size={10} /> : null}
                  </TagFilterCheck>
                  <TagFilterName>{tag}</TagFilterName>
                  <TagFilterCountBadge>{counts[tag] ?? 0}</TagFilterCountBadge>
                </TagFilterRow>
              );
            })}
            {sorted.length === 0 ? <TagFilterEmpty>No matching tags.</TagFilterEmpty> : null}
          </TagFilterList>
        </TagFilterPanel>
      ) : null}
    </TagFilterAnchor>
  );
}
