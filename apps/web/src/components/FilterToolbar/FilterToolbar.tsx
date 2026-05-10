import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Info, Search, X } from 'lucide-react';
import type { EnvelopeListItem } from 'shared';
import {
  parseFilters,
  serializeFilters,
  type EnvelopeFilters,
  type StatusOption,
  type DateFilter,
  type DatePreset,
  bucketEnvelope,
} from '@/features/dashboardFilters';
import { FilterChipPopover } from './FilterChipPopover';
import {
  CustomDateField,
  CustomDateRow,
  Option,
  OptionBody,
  OptionCount,
  OptionDesc,
  OptionLabel,
  PopoverFooter,
  PopoverFooterIcon,
  PopoverHeader,
  PopoverHeaderAction,
  ResetButton,
  SearchClear,
  SearchInput,
  SearchInputWrap,
  SignerInput,
  ToolbarRoot,
} from './FilterToolbar.styles';

const STATUS_LABELS: Record<StatusOption, string> = {
  draft: 'Draft',
  awaiting_you: 'Awaiting you',
  awaiting_others: 'Awaiting others',
  sealed: 'Sealed',
  declined: 'Declined',
};

const STATUS_DESCRIPTIONS: Record<StatusOption, string> = {
  draft: 'Not sent yet',
  awaiting_you: 'Your turn to sign',
  awaiting_others: 'Out for signature',
  sealed: 'All signers complete',
  declined: 'Someone declined',
};

const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  thisMonth: 'This month',
  all: 'All time',
};

const DATE_PRESET_DESCRIPTIONS: Record<DatePreset, string> = {
  today: 'Activity in the last 24 hours',
  '7d': 'A week of recent activity',
  '30d': 'Roughly the last month',
  thisMonth: 'From the 1st of this month',
  all: 'No date filter',
};

const STATUS_ORDER: ReadonlyArray<StatusOption> = [
  'awaiting_you',
  'awaiting_others',
  'draft',
  'sealed',
  'declined',
];
const PRESET_ORDER: ReadonlyArray<DatePreset> = ['today', '7d', '30d', 'thisMonth', 'all'];

export interface FilterToolbarProps {
  /**
   * Current envelope list. Used to derive status counts (shown in the
   * Status chip popover) and the unique signer roster (shown in the
   * Signer chip popover). The toolbar does not filter; the page does.
   */
  readonly envelopes: ReadonlyArray<EnvelopeListItem>;
  /**
   * Viewer email — needed for the awaiting-you bucket count. Pass
   * `null` for unauthenticated viewers (count for awaiting-you will
   * be zero in that case, which is also correct).
   */
  readonly viewerEmail: string | null;
}

interface DraftRange {
  readonly from: string;
  readonly to: string;
}

export function FilterToolbar({ envelopes, viewerEmail }: FilterToolbarProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(searchParams), [searchParams]);

  // Local-only buffer for the search input so the user gets instant
  // typing feedback without writing the URL on every keystroke. The
  // debounced effect below is the single source that pushes to the
  // URL after 250 ms of silence — the spec's "do not overwhelm"
  // contract for the search field.
  const [searchDraft, setSearchDraft] = useState(filters.q);
  // Re-sync the draft when the URL changes from elsewhere (e.g. the
  // Clear chip stripping every param). Skipped while the user is
  // mid-typing — the debounced write below will reconcile.
  const userTypingRef = useRef(false);
  useEffect(() => {
    if (!userTypingRef.current) setSearchDraft(filters.q);
  }, [filters.q]);

  // Debounced write of the search draft to the URL. Replace history
  // (don't push) so back-button doesn't accumulate every keystroke.
  useEffect(() => {
    if (searchDraft === filters.q) return undefined;
    const t = setTimeout(() => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchDraft === '') next.delete('q');
          else next.set('q', searchDraft);
          return next;
        },
        { replace: true },
      );
      userTypingRef.current = false;
    }, 250);
    return () => clearTimeout(t);
  }, [searchDraft, filters.q, setSearchParams]);

  /** Replace the entire filter set, leaving non-filter params alone. */
  const applyFilters = useCallback(
    (next: { filters: EnvelopeFilters; explicitAllStatus?: boolean }) => {
      setSearchParams(
        (prev) => {
          const carrier = new URLSearchParams(prev);
          carrier.delete('q');
          carrier.delete('status');
          carrier.delete('date');
          carrier.delete('signer');
          carrier.delete('tags');
          const written = new URLSearchParams(
            serializeFilters({
              ...next.filters,
              ...(next.explicitAllStatus !== undefined
                ? { explicitAllStatus: next.explicitAllStatus }
                : {}),
            }),
          );
          for (const [k, v] of written) carrier.set(k, v);
          return carrier;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setStatus = useCallback(
    (next: ReadonlyArray<StatusOption>, options?: { explicitAllStatus?: boolean }) => {
      applyFilters({
        filters: { ...filters, status: next },
        ...(options?.explicitAllStatus !== undefined
          ? { explicitAllStatus: options.explicitAllStatus }
          : {}),
      });
    },
    [applyFilters, filters],
  );

  const setDate = useCallback(
    (next: DateFilter) => {
      applyFilters({ filters: { ...filters, date: next } });
    },
    [applyFilters, filters],
  );

  const setSigner = useCallback(
    (next: ReadonlyArray<string>) => {
      applyFilters({ filters: { ...filters, signer: next } });
    },
    [applyFilters, filters],
  );

  const setTagsFilter = useCallback(
    (next: ReadonlyArray<string>) => {
      applyFilters({ filters: { ...filters, tags: next } });
    },
    [applyFilters, filters],
  );

  // Local-only buffer for the in-popover signer + tag search boxes.
  // The search just narrows the visible list; only the checkbox
  // toggle actually changes the URL filter.
  const [signerSearch, setSignerSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');

  const clearAll = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('q');
        next.delete('status');
        next.delete('date');
        next.delete('signer');
        next.delete('tags');
        return next;
      },
      { replace: true },
    );
    setSearchDraft('');
    userTypingRef.current = false;
  }, [setSearchParams]);

  // Derived: status counts (for the Status chip's popover) and the
  // unique signer list (for the Signer chip's popover). Both are
  // O(envelopes) so a single useMemo over the source list keeps the
  // toolbar render cheap.
  const statusCounts = useMemo(() => {
    const counts = new Map<StatusOption, number>();
    for (const env of envelopes) {
      const bucket = bucketEnvelope(env, viewerEmail);
      if (bucket !== null) counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    }
    return counts;
  }, [envelopes, viewerEmail]);

  const uniqueTags = useMemo(() => {
    const set = new Set<string>();
    const tally = new Map<string, number>();
    for (const env of envelopes) {
      for (const t of env.tags ?? []) {
        const key = t.toLowerCase();
        set.add(key);
        tally.set(key, (tally.get(key) ?? 0) + 1);
      }
    }
    return Array.from(set)
      .sort()
      .map((tag) => ({ tag, count: tally.get(tag) ?? 0 }));
  }, [envelopes]);

  const uniqueSigners = useMemo(() => {
    const map = new Map<string, { name: string; email: string }>();
    for (const env of envelopes) {
      for (const s of env.signers) {
        const key = s.email.toLowerCase();
        if (!map.has(key)) map.set(key, { name: s.name, email: s.email });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email),
    );
  }, [envelopes]);

  // Active flags drive the chip's accent + clear-button affordance.
  // Search active is computed from the draft so the chip lights up
  // immediately while typing, before the URL has been written.
  const isStatusActive = filters.status.length > 0;
  const isDateActive = filters.date.kind !== 'preset' || filters.date.preset !== 'all';
  const isSignerActive = filters.signer.length > 0;
  const isTagsActive = filters.tags.length > 0;
  const isSearchActive = searchDraft !== '';
  const anyActive =
    isStatusActive || isDateActive || isSignerActive || isTagsActive || isSearchActive;

  // Compact value previews shown in the trigger when a chip is active.
  const statusPreview = formatStatusPreview(filters.status);
  const datePreview = formatDatePreview(filters.date);
  const signerPreview = formatSignerPreview(filters.signer, uniqueSigners);
  const tagsPreview = formatListPreview(filters.tags);

  // Local draft for custom date range until the user blurs / picks an
  // explicit preset — saves a URL write per arrow-key on the date input.
  const [draftRange, setDraftRange] = useState<DraftRange>(() => {
    if (filters.date.kind === 'custom') return filters.date.range;
    return { from: '', to: '' };
  });
  useEffect(() => {
    if (filters.date.kind === 'custom') setDraftRange(filters.date.range);
  }, [filters.date]);

  return (
    <ToolbarRoot role="toolbar" aria-label="Document filters">
      <SearchInputWrap>
        <Search size={14} aria-hidden />
        <SearchInput
          type="search"
          placeholder="Search documents…"
          value={searchDraft}
          onChange={(e) => {
            userTypingRef.current = true;
            setSearchDraft(e.target.value);
          }}
          aria-label="Search documents"
        />
        {searchDraft !== '' ? (
          <SearchClear
            type="button"
            onClick={() => {
              userTypingRef.current = false;
              setSearchDraft('');
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.delete('q');
                  return next;
                },
                { replace: true },
              );
            }}
            aria-label="Clear search"
          >
            <X size={14} aria-hidden />
          </SearchClear>
        ) : null}
      </SearchInputWrap>

      <FilterChipPopover
        label="Status"
        value={statusPreview}
        active={isStatusActive}
        {...(isStatusActive ? { onClear: () => setStatus([]) } : {})}
      >
        <PopoverHeader>
          <span>Status</span>
          {/* Smart toggle: when at least one option is checked the
              header link becomes "Deselect all" (un-ticks every box
              + writes the `?status=all` sentinel so the actionable
              inbox default doesn't re-apply on reload). When nothing
              is checked the link flips to "Select all" and ticks
              every option in one click. */}
          {filters.status.length > 0 ? (
            <PopoverHeaderAction
              type="button"
              onClick={() => setStatus([], { explicitAllStatus: true })}
            >
              Deselect all
            </PopoverHeaderAction>
          ) : (
            <PopoverHeaderAction type="button" onClick={() => setStatus([...STATUS_ORDER])}>
              Select all
            </PopoverHeaderAction>
          )}
        </PopoverHeader>
        {STATUS_ORDER.map((opt) => {
          const checked = filters.status.includes(opt);
          const count = statusCounts.get(opt) ?? 0;
          return (
            <Option key={opt}>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => {
                  const isOn = e.currentTarget.checked;
                  const next = isOn
                    ? [...filters.status, opt]
                    : filters.status.filter((s) => s !== opt);
                  setStatus(next);
                }}
                aria-label={STATUS_LABELS[opt]}
              />
              <OptionBody>
                <OptionLabel>{STATUS_LABELS[opt]}</OptionLabel>
                <OptionDesc>{STATUS_DESCRIPTIONS[opt]}</OptionDesc>
              </OptionBody>
              <OptionCount>{count}</OptionCount>
            </Option>
          );
        })}
      </FilterChipPopover>

      <FilterChipPopover
        label="Date"
        value={datePreview}
        active={isDateActive}
        {...(isDateActive ? { onClear: () => setDate({ kind: 'preset', preset: 'all' }) } : {})}
      >
        <PopoverHeader>
          <span>Last activity</span>
        </PopoverHeader>
        {PRESET_ORDER.map((preset) => {
          const checked = filters.date.kind === 'preset' && filters.date.preset === preset;
          return (
            <Option key={preset}>
              <input
                type="radio"
                name="date-preset"
                checked={checked}
                onChange={() => setDate({ kind: 'preset', preset })}
                aria-label={DATE_PRESET_LABELS[preset]}
              />
              <OptionBody>
                <OptionLabel>{DATE_PRESET_LABELS[preset]}</OptionLabel>
                <OptionDesc>{DATE_PRESET_DESCRIPTIONS[preset]}</OptionDesc>
              </OptionBody>
            </Option>
          );
        })}
        <PopoverHeader>
          <span>Custom range</span>
        </PopoverHeader>
        <CustomDateRow>
          <CustomDateField
            type="date"
            value={draftRange.from}
            onChange={(e) => setDraftRange((p) => ({ ...p, from: e.target.value }))}
            onBlur={() => {
              if (
                draftRange.from !== '' &&
                draftRange.to !== '' &&
                draftRange.from <= draftRange.to
              ) {
                setDate({ kind: 'custom', range: draftRange });
              }
            }}
            aria-label="From"
          />
          <CustomDateField
            type="date"
            value={draftRange.to}
            onChange={(e) => setDraftRange((p) => ({ ...p, to: e.target.value }))}
            onBlur={() => {
              if (
                draftRange.from !== '' &&
                draftRange.to !== '' &&
                draftRange.from <= draftRange.to
              ) {
                setDate({ kind: 'custom', range: draftRange });
              }
            }}
            aria-label="To"
          />
        </CustomDateRow>
      </FilterChipPopover>

      <FilterChipPopover
        label="Signer"
        value={signerPreview}
        active={isSignerActive}
        {...(isSignerActive ? { onClear: () => setSigner([]) } : {})}
      >
        <PopoverHeader>
          <span>Signer</span>
          {filters.signer.length > 0 ? (
            <PopoverHeaderAction type="button" onClick={() => setSigner([])}>
              Clear
            </PopoverHeaderAction>
          ) : null}
        </PopoverHeader>
        <SignerInput
          type="search"
          placeholder="Search by name or email…"
          value={signerSearch}
          onChange={(e) => setSignerSearch(e.target.value)}
          aria-label="Search signers"
        />
        {uniqueSigners.length > 0 ? (
          <div role="list" style={{ maxHeight: 260, overflowY: 'auto' }}>
            {uniqueSigners
              .filter((s) => {
                if (signerSearch === '') return true;
                const needle = signerSearch.toLowerCase();
                return (
                  s.name.toLowerCase().includes(needle) || s.email.toLowerCase().includes(needle)
                );
              })
              .slice(0, 50)
              .map((s) => {
                const key = s.email.toLowerCase();
                const checked = filters.signer.includes(key);
                // Name only; fall back to the email's local part
                // when the contact has no display name.
                const display = s.name.trim() !== '' ? s.name : s.email.split('@')[0] || s.email;
                return (
                  <Option key={s.email} role="listitem">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const isOn = e.currentTarget.checked;
                        setSigner(
                          isOn ? [...filters.signer, key] : filters.signer.filter((x) => x !== key),
                        );
                      }}
                      aria-label={display}
                    />
                    <OptionBody>
                      <OptionLabel>{display}</OptionLabel>
                    </OptionBody>
                  </Option>
                );
              })}
          </div>
        ) : null}
        <PopoverFooter>
          <PopoverFooterIcon>
            <Info size={12} aria-hidden />
          </PopoverFooterIcon>
          <span>Pick multiple to see envelopes that include any of them.</span>
        </PopoverFooter>
      </FilterChipPopover>

      <FilterChipPopover
        label="Tags"
        value={tagsPreview}
        active={isTagsActive}
        {...(isTagsActive ? { onClear: () => setTagsFilter([]) } : {})}
      >
        <PopoverHeader>
          <span>Tags</span>
          {filters.tags.length > 0 ? (
            <PopoverHeaderAction type="button" onClick={() => setTagsFilter([])}>
              Clear
            </PopoverHeaderAction>
          ) : null}
        </PopoverHeader>
        {uniqueTags.length === 0 ? (
          <PopoverFooter>
            <PopoverFooterIcon>
              <Info size={12} aria-hidden />
            </PopoverFooterIcon>
            <span>
              You haven&apos;t tagged any envelopes yet. Add tags from a row or the envelope page.
            </span>
          </PopoverFooter>
        ) : (
          <>
            <SignerInput
              type="search"
              placeholder="Search tags…"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              aria-label="Search tags"
            />
            <div role="list" style={{ maxHeight: 260, overflowY: 'auto' }}>
              {uniqueTags
                .filter(({ tag }) => {
                  if (tagSearch === '') return true;
                  return tag.includes(tagSearch.toLowerCase());
                })
                .slice(0, 50)
                .map(({ tag, count }) => {
                  const checked = filters.tags.includes(tag);
                  return (
                    <Option key={tag} role="listitem">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const isOn = e.currentTarget.checked;
                          setTagsFilter(
                            isOn ? [...filters.tags, tag] : filters.tags.filter((x) => x !== tag),
                          );
                        }}
                        aria-label={tag}
                      />
                      <OptionBody>
                        <OptionLabel>{tag}</OptionLabel>
                      </OptionBody>
                      <OptionCount>{count}</OptionCount>
                    </Option>
                  );
                })}
            </div>
          </>
        )}
      </FilterChipPopover>

      {anyActive ? (
        <ResetButton type="button" onClick={clearAll} aria-label="Clear all filters">
          ✕ Clear filters
        </ResetButton>
      ) : null}
    </ToolbarRoot>
  );
}

function formatListPreview(selected: ReadonlyArray<string>): string {
  if (selected.length === 0) return '';
  if (selected.length === 1) return selected[0]!;
  return `${selected[0]!}, +${selected.length - 1}`;
}

function formatStatusPreview(selected: ReadonlyArray<StatusOption>): string {
  if (selected.length === 0) return '';
  if (selected.length === 1) return STATUS_LABELS[selected[0]!];
  return `${STATUS_LABELS[selected[0]!]}, +${selected.length - 1}`;
}

function formatDatePreview(date: DateFilter): string {
  if (date.kind === 'custom') return `${date.range.from} → ${date.range.to}`;
  if (date.preset === 'all') return '';
  return DATE_PRESET_LABELS[date.preset];
}

function formatSignerPreview(
  selected: ReadonlyArray<string>,
  roster: ReadonlyArray<{ name: string; email: string }>,
): string {
  if (selected.length === 0) return '';
  // Resolve each selected email back to a display name so the chip
  // preview reads "Eliran" instead of "eliran@nromomentum.com". Fall
  // back to the email's local part when the contact has no name.
  const byEmail = new Map(roster.map((s) => [s.email.toLowerCase(), s] as const));
  const displays = selected.map((emailKey) => {
    const found = byEmail.get(emailKey);
    if (found && found.name.trim() !== '') return found.name;
    if (found) return found.email.split('@')[0] ?? found.email;
    return emailKey.split('@')[0] ?? emailKey;
  });
  if (displays.length === 1) return displays[0]!;
  return `${displays[0]!}, +${displays.length - 1}`;
}
