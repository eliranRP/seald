import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp,
  Calendar,
  ChevronDown,
  CircleCheck,
  ListFilter,
  Search,
  Tag as TagIcon,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/Button';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { DATE_PRESETS, hasActiveFilters } from '@/features/dashboard';
import type { DatePreset, PersonOption, SortKey, ViewFilters } from '@/features/dashboard';
import {
  Chip,
  ChipsRow,
  CountPill,
  Kbd,
  ResultCount,
  SearchField,
  SelectButton,
  Spacer,
  ToolbarRow,
} from './DashboardPage.styles';

export const DATE_LABEL: Record<DatePreset, string> = {
  any: 'Any time',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  month: 'This month',
};

export const SORT_LABEL: Record<SortKey, string> = {
  recent: 'Recent',
  oldest: 'Oldest',
  title: 'Title',
};

export interface HomeToolbarProps {
  readonly filters: ViewFilters;
  readonly onChange: (patch: Partial<ViewFilters>) => void;
  readonly onClear: () => void;
  readonly people: ReadonlyArray<PersonOption>;
  readonly tags: ReadonlyArray<string>;
  readonly mobile: boolean;
  readonly onOpenFilterSheet: () => void;
  readonly onStartSelecting: () => void;
  /** Phones: the search field shows only once the header's search button opened it. */
  readonly searchOpen?: boolean | undefined;
  /** Phones: the number of documents listed, shown at the end of the row. */
  readonly resultCount?: number | undefined;
}

interface SelectMenuProps {
  readonly label: string;
  readonly aria: string;
  readonly icon: LucideIcon;
  readonly isSet: boolean;
  readonly items: ReadonlyArray<MenuEntry>;
  readonly align?: 'start' | 'end';
}

function SelectMenu(props: SelectMenuProps) {
  const { label, aria, icon: Icon, isSet, items, align = 'start' } = props;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  return (
    <MenuAnchor>
      <SelectButton
        ref={ref}
        type="button"
        $set={isSet}
        aria-label={aria}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon size={16} aria-hidden />
        {label}
        <ChevronDown size={16} aria-hidden />
      </SelectButton>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        anchorRef={ref}
        align={align}
        aria-label={aria}
      />
    </MenuAnchor>
  );
}

interface SortMenuProps {
  readonly label: string;
  readonly items: ReadonlyArray<MenuEntry>;
  readonly mobile: boolean;
}

/** Canvas sort control: a plain ghost "Recent" button with the sort icon, no chevron. */
function SortMenu({ label, items, mobile }: SortMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);
  return (
    <MenuAnchor>
      <Button
        ref={ref}
        variant="ghost"
        size={mobile ? 'md' : 'sm'}
        iconLeft={ArrowDownUp}
        aria-label="Sort"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </Button>
      <Menu
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        anchorRef={ref}
        align={mobile ? 'start' : 'end'}
        aria-label="Sort"
      />
    </MenuAnchor>
  );
}

/** "Anyone" / the one picked name / "3 people". */
function summarize(
  picked: ReadonlyArray<string>,
  none: string,
  many: (count: number) => string,
): string {
  if (picked.length === 0) return none;
  return picked.length === 1 ? (picked[0] ?? none) : many(picked.length);
}

function toggle(list: ReadonlyArray<string>, value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** Search, date / people / tag filters, sort, and the applied-filter chips. */
export function HomeToolbar(props: HomeToolbarProps) {
  const { filters, onChange, onClear, people, tags, mobile, searchOpen = false } = props;
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(filters.query);
  // Desktop: the date / people / tag menus stay folded behind one Filter
  // button until asked for, so the toolbar reads as "search + filter + sort".
  const [filtersOpen, setFiltersOpen] = useState(false);

  // The query this box last sent. When that value comes back as
  // `filters.query` it is our own, possibly after the user typed on, so
  // only a different value (a chip cleared it) resets the box.
  const sentQuery = useRef(filters.query);

  // Keep the box in step when the query is cleared from a chip.
  useEffect(() => {
    if (filters.query === sentQuery.current) return;
    sentQuery.current = filters.query;
    setDraft(filters.query);
  }, [filters.query]);

  // Debounce typing into the filter state.
  useEffect(() => {
    if (draft === filters.query) return undefined;
    const t = setTimeout(() => {
      sentQuery.current = draft;
      onChange({ query: draft });
    }, 200);
    return () => clearTimeout(t);
  }, [draft, filters.query, onChange]);

  // "/" focuses search.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const el = e.target as HTMLElement | null;
      const typing =
        el !== null &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
      if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const dateItems = useMemo<MenuEntry[]>(
    () => [
      { type: 'label', id: 'date-label', label: 'Updated' },
      ...DATE_PRESETS.map((p) => ({
        id: `date-${p}`,
        label: DATE_LABEL[p],
        checked: filters.date === p,
        onSelect: () => onChange({ date: p }),
      })),
    ],
    [filters.date, onChange],
  );
  const peopleItems = useMemo<MenuEntry[]>(
    () =>
      people.length === 0
        ? [{ type: 'label', id: 'people-none', label: 'No signers yet' }]
        : people.map((p) => ({
            id: `p-${p.email}`,
            label: p.name,
            checked: filters.people.includes(p.email),
            onSelect: () => onChange({ people: toggle(filters.people, p.email) }),
          })),
    [people, filters.people, onChange],
  );
  const tagItems = useMemo<MenuEntry[]>(
    () =>
      tags.length === 0
        ? [{ type: 'label', id: 'tags-none', label: 'No tags yet' }]
        : tags.map((t) => ({
            id: `t-${t}`,
            label: t,
            checked: filters.tags.includes(t),
            onSelect: () => onChange({ tags: toggle(filters.tags, t) }),
          })),
    [tags, filters.tags, onChange],
  );
  const sortItems = useMemo<MenuEntry[]>(
    () =>
      (Object.keys(SORT_LABEL) as SortKey[]).map((k) => ({
        id: `s-${k}`,
        label: SORT_LABEL[k],
        checked: filters.sort === k,
        onSelect: () => onChange({ sort: k }),
      })),
    [filters.sort, onChange],
  );

  const personName = (email: string): string =>
    people.find((p) => p.email === email)?.name ?? email;
  const peopleLabel = summarize(filters.people.map(personName), 'Anyone', (n) => `${n} people`);
  const tagsLabel = summarize(filters.tags, 'All tags', (n) => `${n} tags`);

  const chips: Array<{ id: string; label: string; remove: () => void }> = [];
  if (filters.query.trim() !== '') {
    chips.push({
      id: 'q',
      label: `“${filters.query.trim()}”`,
      remove: () => onChange({ query: '' }),
    });
  }
  if (filters.date !== 'any') {
    chips.push({
      id: 'date',
      label: DATE_LABEL[filters.date],
      remove: () => onChange({ date: 'any' }),
    });
  }
  for (const p of filters.people) {
    chips.push({
      id: `p-${p}`,
      label: personName(p),
      remove: () => onChange({ people: filters.people.filter((x) => x !== p) }),
    });
  }
  for (const t of filters.tags) {
    chips.push({
      id: `t-${t}`,
      label: t,
      remove: () => onChange({ tags: filters.tags.filter((x) => x !== t) }),
    });
  }

  const activeCount = chips.length;
  const refineCount =
    (filters.date !== 'any' ? 1 : 0) + filters.people.length + filters.tags.length;
  const showRefine = filtersOpen || refineCount > 0;
  const search = (
    <SearchField>
      <Search size={16} aria-hidden />
      <input
        ref={searchRef}
        type="search"
        placeholder="Search"
        aria-label="Search documents"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        // Phones open the field from the header's search button, so focus it.
        autoFocus={mobile && searchOpen}
      />
      <Kbd aria-hidden>/</Kbd>
    </SearchField>
  );

  return (
    <>
      {mobile ? (
        <>
          {searchOpen || draft !== '' ? <ToolbarRow>{search}</ToolbarRow> : null}
          <ToolbarRow>
            <SelectButton
              type="button"
              $tall
              $set={activeCount > 0}
              aria-haspopup="dialog"
              onClick={props.onOpenFilterSheet}
            >
              <ListFilter size={16} aria-hidden />
              Filter
              {activeCount > 0 ? <CountPill $accent>{activeCount}</CountPill> : null}
            </SelectButton>
            <SortMenu label={SORT_LABEL[filters.sort]} items={sortItems} mobile />
            <Spacer />
            <Button variant="ghost" iconLeft={CircleCheck} onClick={props.onStartSelecting}>
              Select
            </Button>
            {props.resultCount !== undefined ? (
              <ResultCount aria-hidden>{props.resultCount}</ResultCount>
            ) : null}
          </ToolbarRow>
        </>
      ) : (
        <ToolbarRow>
          {search}
          <SelectButton
            type="button"
            $set={refineCount > 0}
            aria-expanded={showRefine}
            onClick={() => setFiltersOpen((o) => !o)}
          >
            <ListFilter size={16} aria-hidden />
            Filter
            {refineCount > 0 ? <CountPill $accent>{refineCount}</CountPill> : null}
          </SelectButton>
          {showRefine ? (
            <>
              <SelectMenu
                label={DATE_LABEL[filters.date]}
                aria={`Date: ${DATE_LABEL[filters.date]}`}
                icon={Calendar}
                isSet={filters.date !== 'any'}
                items={dateItems}
              />
              <SelectMenu
                label={peopleLabel}
                aria={`People: ${peopleLabel}`}
                icon={Users}
                isSet={filters.people.length > 0}
                items={peopleItems}
              />
              <SelectMenu
                label={tagsLabel}
                aria={`Tags: ${tagsLabel}`}
                icon={TagIcon}
                isSet={filters.tags.length > 0}
                items={tagItems}
              />
            </>
          ) : null}
          <Spacer />
          <SortMenu label={SORT_LABEL[filters.sort]} items={sortItems} mobile={false} />
        </ToolbarRow>
      )}
      {hasActiveFilters(filters) ? (
        <ChipsRow>
          {chips.map((c) => (
            <Chip key={c.id}>
              {c.label}
              <button type="button" aria-label={`Remove ${c.label}`} onClick={c.remove}>
                <X size={12} aria-hidden />
              </button>
            </Chip>
          ))}
          <Button variant="ghost" size="sm" onClick={onClear}>
            Clear
          </Button>
        </ChipsRow>
      ) : null}
    </>
  );
}
