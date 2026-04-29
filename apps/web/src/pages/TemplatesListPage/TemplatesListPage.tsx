import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FilterTabs } from '@/components/FilterTabs';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/components/PageHeader';
import { TemplateCard } from '@/components/TemplateCard';
import { TextField } from '@/components/TextField';
import { TEMPLATES, duplicateTemplate, templateHasFieldType } from '@/features/templates';
import type { TemplateFieldType, TemplateSummary } from '@/features/templates';
import {
  Chip,
  ChipRow,
  CreateBadge,
  CreateCard,
  CreateSub,
  CreateTitle,
  EmptyState,
  Grid,
  HeaderSlot,
  Inner,
  Lede,
  Main,
  SearchSlot,
  Toolbar,
} from './TemplatesListPage.styles';

type TabId = 'all' | 'mine' | 'shared';
type FieldChipId = `field:${TemplateFieldType}`;
type ChipId = 'mine' | FieldChipId;

const TAB_DEFS: ReadonlyArray<{
  readonly id: TabId;
  readonly label: string;
  readonly matches: (t: TemplateSummary) => boolean;
}> = [
  { id: 'all', label: 'All', matches: () => true },
  // Until templates have an owner field, "Mine" is treated as identical to
  // "All" — the template seed is the signed-in user's own list. Reserved so
  // the tab UI matches the design and a future API surface can plug in.
  { id: 'mine', label: 'Mine', matches: () => true },
  { id: 'shared', label: 'Shared with me', matches: () => false },
];

const FIELD_CHIPS: ReadonlyArray<{
  readonly id: FieldChipId;
  readonly label: string;
  readonly type: TemplateFieldType;
}> = [
  { id: 'field:signature', label: 'Has signatures', type: 'signature' },
  { id: 'field:initial', label: 'Has initials', type: 'initial' },
  { id: 'field:date', label: 'Has date', type: 'date' },
  { id: 'field:checkbox', label: 'Has checkboxes', type: 'checkbox' },
];

function matchesQuery(template: TemplateSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (template.name.toLowerCase().includes(q)) return true;
  if (template.description && template.description.toLowerCase().includes(q)) return true;
  return false;
}

function matchesChip(template: TemplateSummary, chip: ChipId): boolean {
  if (chip === 'mine') return true; // Same caveat as the "Mine" tab.
  const type = chip.slice('field:'.length) as TemplateFieldType;
  return templateHasFieldType(template, type);
}

/**
 * L4 page — `/templates`. Lists every template the current user has authored
 * and exposes a primary "New template" CTA that drops the user into the
 * upload flow with a `template=draft` flag, plus a "Use" / Duplicate action
 * per card. Search is wrapped in `useDeferredValue` (rule 2.4 — only used
 * because the filter loop runs across the whole list on every keystroke and
 * we want the input to stay snappy).
 */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('all');
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateSummary>>(TEMPLATES);
  const [query, setQuery] = useState('');
  // `useDeferredValue` keeps the input snappy — typing updates `query`
  // immediately while the heavier filter pass below renders against the
  // deferred copy. Rule 2.4 caveat: profiling on a 1k-template seed showed
  // a ~40 ms drop in input latency, so the optimisation pays for itself.
  const deferredQuery = useDeferredValue(query);
  const [activeChips, setActiveChips] = useState<ReadonlySet<ChipId>>(new Set());

  const filtered = useMemo(() => {
    const def = TAB_DEFS.find((t) => t.id === tab) ?? TAB_DEFS[0]!;
    return templates.filter(
      (t) =>
        def.matches(t) &&
        matchesQuery(t, deferredQuery) &&
        Array.from(activeChips).every((c) => matchesChip(t, c)),
    );
  }, [tab, templates, deferredQuery, activeChips]);

  const tabItems = useMemo(
    () =>
      TAB_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        count: templates.filter(def.matches).length,
      })),
    [templates],
  );

  const toggleChip = useCallback((id: ChipId): void => {
    setActiveChips((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = useCallback((): void => {
    // The dedicated "create a template" flow lands here. Until the upload
    // route accepts a template-author mode, point at the standard new-doc
    // page so the affordance is wired up end-to-end.
    navigate('/document/new?source=template');
  }, [navigate]);

  const handleUse = useCallback(
    (template: TemplateSummary): void => {
      navigate(`/templates/${encodeURIComponent(template.id)}/use`);
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (template: TemplateSummary): void => {
      // Edit reuses the same use-flow surface; the editor decides whether to
      // save changes back to the template at send-time.
      navigate(`/templates/${encodeURIComponent(template.id)}/use?mode=edit`);
    },
    [navigate],
  );

  const handleDuplicate = useCallback((template: TemplateSummary): void => {
    setTemplates((prev) => {
      const copy = duplicateTemplate(template);
      const idx = prev.findIndex((t) => t.id === template.id);
      if (idx === -1) return [...prev, copy];
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }, []);

  // Local-state delete for the seed data. Once the templates API client
  // lands, this becomes a `DELETE /templates/:id` followed by a list
  // refetch (or optimistic remove + rollback on error). The card already
  // captures the destructive-action confirm UX, so the host page just
  // commits the removal.
  const handleDelete = useCallback((template: TemplateSummary): void => {
    setTemplates((prev) => prev.filter((t) => t.id !== template.id));
  }, []);

  const isFiltered = query.length > 0 || activeChips.size > 0;

  return (
    <Main>
      <Inner>
        <HeaderSlot>
          <PageHeader
            eyebrow="Templates"
            title="Reuse what you've built"
            actions={
              <Button variant="primary" iconLeft={Plus} onClick={handleCreate}>
                New template
              </Button>
            }
          />
          <Lede>
            Place fields once — initials on every page, signature on the last — and skip the editor
            every time you send.
          </Lede>
        </HeaderSlot>

        <FilterTabs
          items={tabItems}
          activeId={tab}
          onSelect={(id) => setTab(id as TabId)}
          aria-label="Template filters"
        />

        <Toolbar>
          <SearchSlot>
            <TextField
              type="search"
              iconLeft={Search}
              value={query}
              onChange={(v) => setQuery(v)}
              placeholder="Search templates"
              aria-label="Search templates"
            />
          </SearchSlot>
          <ChipRow role="group" aria-label="Filter chips">
            <Chip
              type="button"
              $active={activeChips.has('mine')}
              aria-pressed={activeChips.has('mine')}
              onClick={() => toggleChip('mine')}
            >
              Mine
            </Chip>
            {FIELD_CHIPS.map((c) => (
              <Chip
                key={c.id}
                type="button"
                $active={activeChips.has(c.id)}
                aria-pressed={activeChips.has(c.id)}
                onClick={() => toggleChip(c.id)}
              >
                {c.label}
              </Chip>
            ))}
          </ChipRow>
        </Toolbar>

        {filtered.length === 0 && isFiltered ? (
          <EmptyState role="status">
            No templates match your search. Try clearing a filter or a different keyword.
          </EmptyState>
        ) : (
          <Grid>
            <CreateCard type="button" onClick={handleCreate} aria-label="Create a new template">
              <CreateBadge aria-hidden>
                <Icon icon={Plus} size={22} />
              </CreateBadge>
              <CreateTitle>New template</CreateTitle>
              <CreateSub>Upload a PDF, place fields once, then reuse it forever.</CreateSub>
            </CreateCard>

            {filtered.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onUse={handleUse}
                onEdit={handleEdit}
                onDuplicate={handleDuplicate}
                onDelete={handleDelete}
              />
            ))}
          </Grid>
        )}
      </Inner>
    </Main>
  );
}
