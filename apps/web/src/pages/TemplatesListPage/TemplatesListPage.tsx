import { useCallback, useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LayoutTemplate, Plus, Search, X } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { Button } from '@/components/Button';
import { ConfirmDeleteDialog } from '@/components/ConfirmDeleteDialog';
import { EmptyState } from '@/components/EmptyState';
import { Icon } from '@/components/Icon';
import { MWBottomSheet } from '@/components/MWBottomSheet';
import { Skeleton } from '@/components/Skeleton';
import { TagEditorPopover } from '@/components/TagEditorPopover';
import { TemplateCard, templateMenuEntries } from '@/components/TemplateCard';
import { Toast } from '@/components/Toast';
import { isBulkSendEnabled } from '@/features/bulkSend';
import { DirectLinkDialog } from '@/features/directLinks';
import {
  getTemplates,
  setTemplates as publishTemplates,
  subscribeToTemplates,
} from '@/features/templates';
import type { TemplateSummary } from '@/features/templates';
import {
  deleteTemplate as apiDeleteTemplate,
  duplicateTemplateApi,
  listTemplates,
  restoreTemplate,
  updateTemplate as apiUpdateTemplate,
} from '@/features/templates/templatesApi';
import { UseTemplateDialog } from '@/features/templates/UseTemplateDialog';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import {
  Count,
  Grid,
  HeaderRow,
  Inner,
  Main,
  Meta,
  Pill,
  Pills,
  SearchField,
  SheetActions,
  SheetHead,
  SkeletonCard,
  Spacer,
  Title,
  Toolbar,
} from './TemplatesListPage.styles';

const UNDO_MS = 6000;
const SKELETON_CARDS = 6;

function matchesQuery(template: TemplateSummary, query: string): boolean {
  return query === '' || template.name.toLowerCase().includes(query);
}

interface ToastState {
  readonly title: string;
  readonly tone: 'success' | 'error' | 'info';
  readonly undo?: () => void;
}

export interface TemplatesListPageProps {
  /**
   * Pre-seed the list. Production passes nothing: templates are
   * user-authored. Tests and stories pass fixtures to render the populated
   * layout without a request.
   */
  readonly initialTemplates?: ReadonlyArray<TemplateSummary>;
}

/**
 * Templates (`/templates`): a card grid with search and tag pills. A card is
 * "Use" (one step: pick people, document, Send now); its ⋯ menu has Edit,
 * Duplicate, Tags and Delete (with Undo). `/templates/:id/use` is the same
 * page with that template's Use dialog open, so old links keep working.
 */
export function TemplatesListPage({ initialTemplates }: TemplatesListPageProps = {}): JSX.Element {
  const navigate = useNavigate();
  const { id: routeUseId } = useParams<{ id?: string }>();
  const isMobile = useIsMobileViewport();

  const [templates, setTemplates] = useState<ReadonlyArray<TemplateSummary>>(
    () => initialTemplates ?? getTemplates(),
  );
  const [loading, setLoading] = useState(initialTemplates === undefined);
  useEffect(() => {
    if (initialTemplates) publishTemplates(initialTemplates);
  }, [initialTemplates]);
  // Other pages (the editor's Save, the Use dialog) publish through the store.
  useEffect(() => subscribeToTemplates(() => setTemplates(getTemplates())), []);
  // Hydrate from the server unless a test or story pre-seeded the list.
  useEffect(() => {
    if (initialTemplates) return undefined;
    const ac = new AbortController();
    listTemplates(ac.signal)
      .then((rows) => publishTemplates(rows))
      .catch((err) => {
        console.warn('[templates] list fetch failed:', err);
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [initialTemplates]);

  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [usingId, setUsingId] = useState<string | null>(routeUseId ?? null);
  const [deleting, setDeleting] = useState<TemplateSummary | null>(null);
  const [editTagsFor, setEditTagsFor] = useState<TemplateSummary | null>(null);
  const [directLinkFor, setDirectLinkFor] = useState<TemplateSummary | null>(null);
  const [sheetFor, setSheetFor] = useState<TemplateSummary | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const bulkOn = isBulkSendEnabled();
  const directLinksOn = isFeatureEnabled('directLinks');

  // ---- derived ---------------------------------------------------------------
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) for (const tag of t.tags ?? []) set.add(tag);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      templates.filter(
        (t) => matchesQuery(t, q) && (activeTag === null || (t.tags ?? []).includes(activeTag)),
      ),
    [templates, q, activeTag],
  );
  const filtering = q !== '' || activeTag !== null;
  const isEmpty = !loading && templates.length === 0;
  const noMatches = !loading && templates.length > 0 && visible.length === 0;

  const usingTemplate = useMemo(
    () => (usingId ? (templates.find((t) => t.id === usingId) ?? null) : null),
    [templates, usingId],
  );

  // A deep link to a template that does not exist: say so and show the list.
  useEffect(() => {
    if (!routeUseId || loading) return;
    if (templates.some((t) => t.id === routeUseId)) {
      setUsingId(routeUseId);
      return;
    }
    setUsingId(null);
    setToast({ title: 'Template not found', tone: 'error' });
    navigate('/templates', { replace: true });
  }, [routeUseId, loading, templates, navigate]);

  // ---- actions ------------------------------------------------------------------
  const closeUse = useCallback((): void => {
    setUsingId(null);
    if (routeUseId) navigate('/templates', { replace: true });
  }, [routeUseId, navigate]);

  const refetch = useCallback((): void => {
    void listTemplates()
      .then(publishTemplates)
      .catch(() => undefined);
  }, []);

  const newTemplate = useCallback((): void => {
    void navigate('/templates/new');
  }, [navigate]);

  const editTemplate = useCallback(
    (t: TemplateSummary): void => {
      navigate(`/templates/${encodeURIComponent(t.id)}/edit?mode=edit`);
    },
    [navigate],
  );

  const duplicate = useCallback((t: TemplateSummary): void => {
    void duplicateTemplateApi(t.id)
      .then((copy) => {
        const current = getTemplates();
        const at = current.findIndex((x) => x.id === t.id);
        publishTemplates(
          at === -1
            ? [copy, ...current]
            : [...current.slice(0, at + 1), copy, ...current.slice(at + 1)],
        );
        setToast({ title: `Duplicated as ${copy.name}`, tone: 'success' });
      })
      .catch(() => setToast({ title: 'Could not duplicate. Try again.', tone: 'error' }));
  }, []);

  const confirmDelete = (): void => {
    const target = deleting;
    if (!target) return;
    setDeleting(null);
    setSheetFor(null);
    // Optimistic: drop the card now; the server soft-deletes and Undo restores.
    publishTemplates(getTemplates().filter((t) => t.id !== target.id));
    apiDeleteTemplate(target.id)
      .then(() =>
        setToast({
          title: 'Template deleted',
          tone: 'success',
          undo: () => {
            setToast(null);
            restoreTemplate(target.id)
              .then(() => refetch())
              .catch(() => setToast({ title: 'Could not undo the delete', tone: 'error' }));
          },
        }),
      )
      .catch(() => {
        refetch();
        setToast({ title: 'Could not delete. Try again.', tone: 'error' });
      });
  };

  /**
   * Persist a tag change: update the store at once, then PATCH the tags and
   * refetch on failure. The tags are computed from the store before the
   * update is scheduled so StrictMode's double invoke cannot send stale ones.
   */
  const updateTags = useCallback(
    (templateId: string, mutate: (tags: ReadonlyArray<string>) => ReadonlyArray<string>): void => {
      const current = getTemplates();
      const target = current.find((t) => t.id === templateId);
      if (!target) return;
      const nextTags = mutate(target.tags ?? []);
      publishTemplates(current.map((t) => (t.id === templateId ? { ...t, tags: nextTags } : t)));
      // Pre-seeded lists (tests, stories) stay local.
      if (initialTemplates) return;
      void apiUpdateTemplate(templateId, { tags: nextTags }).catch(() => refetch());
    },
    [initialTemplates, refetch],
  );

  const editTarget = useMemo(
    () => (editTagsFor ? (templates.find((t) => t.id === editTagsFor.id) ?? editTagsFor) : null),
    [editTagsFor, templates],
  );

  const actions = {
    onEdit: editTemplate,
    onDuplicate: duplicate,
    onEditTags: setEditTagsFor,
    onDelete: setDeleting,
  } as const;

  const clearFilters = (): void => {
    setQuery('');
    setActiveTag(null);
  };

  const resultsText = `${String(visible.length)} ${visible.length === 1 ? 'result' : 'results'}`;

  // ---- render --------------------------------------------------------------------
  return (
    <Main>
      <Inner>
        <HeaderRow>
          <Title>Templates</Title>
          {loading ? (
            <Skeleton variant="circle" width={20} height={20} />
          ) : (
            <Count aria-label={`${String(templates.length)} templates`}>{templates.length}</Count>
          )}
          <Spacer />
          {isMobile ? (
            <>
              <Button
                variant="ghost"
                iconOnly
                iconLeft={Search}
                aria-label="Search templates"
                onClick={() => setSearchOpen((v) => !v)}
              />
              <Button
                variant="ghost"
                iconOnly
                iconLeft={Plus}
                aria-label="New template"
                onClick={newTemplate}
              />
            </>
          ) : null}
          {!isMobile && !isEmpty ? (
            <Button variant="primary" iconLeft={Plus} onClick={newTemplate}>
              New template
            </Button>
          ) : null}
        </HeaderRow>

        {!isEmpty && (!isMobile || searchOpen || allTags.length > 0) ? (
          <Toolbar>
            {!isMobile || searchOpen ? (
              <SearchField>
                <Icon icon={Search} size={16} />
                <input
                  type="search"
                  value={query}
                  placeholder="Search templates"
                  aria-label="Search templates"
                  onChange={(e) => setQuery(e.target.value)}
                />
                {isMobile ? (
                  <Button
                    variant="ghost"
                    iconOnly
                    iconLeft={X}
                    aria-label="Clear search"
                    onClick={() => {
                      setQuery('');
                      setSearchOpen(false);
                    }}
                  />
                ) : null}
              </SearchField>
            ) : null}
            {allTags.length > 0 ? (
              <Pills role="group" aria-label="Filter by tag">
                <Pill
                  type="button"
                  $active={activeTag === null}
                  aria-pressed={activeTag === null}
                  onClick={() => setActiveTag(null)}
                >
                  All
                </Pill>
                {allTags.map((tag) => (
                  <Pill
                    key={tag}
                    type="button"
                    $active={activeTag === tag}
                    aria-pressed={activeTag === tag}
                    onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  >
                    {tag}
                  </Pill>
                ))}
              </Pills>
            ) : null}
          </Toolbar>
        ) : null}

        {filtering && !loading && visible.length > 0 ? (
          <Meta role="status">{resultsText}</Meta>
        ) : null}

        {loading ? (
          <Grid aria-busy="true" aria-label="Loading templates">
            {Array.from({ length: SKELETON_CARDS }, (_, i) => (
              <SkeletonCard key={`sk-${String(i)}`}>
                <Skeleton variant="rect" height="100%" />
              </SkeletonCard>
            ))}
          </Grid>
        ) : null}

        {isEmpty ? (
          <EmptyState
            icon={LayoutTemplate}
            title="No templates yet"
            action={
              <Button variant="primary" iconLeft={Plus} onClick={newTemplate}>
                New template
              </Button>
            }
          />
        ) : null}

        {noMatches ? (
          <EmptyState
            icon={Search}
            title="No matches"
            action={
              <Button variant="secondary" onClick={clearFilters}>
                Clear search
              </Button>
            }
          />
        ) : null}

        {visible.length > 0 ? (
          <Grid>
            {visible.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                compact={isMobile}
                onUse={(tpl) => setUsingId(tpl.id)}
                onMore={setSheetFor}
                {...actions}
                {...(bulkOn && t.hasExamplePdf
                  ? {
                      onBulkSend: (tpl: TemplateSummary) =>
                        navigate(`/templates/${encodeURIComponent(tpl.id)}/bulk-send`),
                    }
                  : {})}
                {...(directLinksOn ? { onDirectLink: setDirectLinkFor } : {})}
              />
            ))}
          </Grid>
        ) : null}
      </Inner>

      <UseTemplateDialog template={usingTemplate} onClose={closeUse} />

      <ConfirmDeleteDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'template'}?`}
        note="Sent documents stay."
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />

      {directLinkFor ? (
        <DirectLinkDialog
          open
          template={{
            id: directLinkFor.id,
            name: directLinkFor.name,
            hasExamplePdf: directLinkFor.hasExamplePdf ?? false,
            lastSigners: directLinkFor.lastSigners ?? [],
          }}
          onClose={() => setDirectLinkFor(null)}
        />
      ) : null}

      <TagEditorPopover
        open={editTagsFor !== null}
        currentTags={editTarget?.tags ?? []}
        allTags={allTags}
        onToggle={(tag) => {
          if (editTagsFor) {
            updateTags(editTagsFor.id, (tags) =>
              tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag],
            );
          }
        }}
        onCreate={(tag) => {
          const clean = tag.trim();
          if (editTagsFor && clean) {
            updateTags(editTagsFor.id, (tags) => (tags.includes(clean) ? tags : [...tags, clean]));
          }
        }}
        onClose={() => setEditTagsFor(null)}
      />

      <MWBottomSheet
        open={isMobile && sheetFor !== null}
        onClose={() => setSheetFor(null)}
        labelledBy="template-actions-title"
      >
        {sheetFor ? (
          <>
            <SheetHead id="template-actions-title">{sheetFor.name}</SheetHead>
            <SheetActions>
              {templateMenuEntries(sheetFor, {
                ...actions,
                ...(bulkOn && sheetFor.hasExamplePdf
                  ? {
                      onBulkSend: (tpl: TemplateSummary) =>
                        navigate(`/templates/${encodeURIComponent(tpl.id)}/bulk-send`),
                    }
                  : {}),
                ...(directLinksOn ? { onDirectLink: setDirectLinkFor } : {}),
              }).map((entry) => {
                if (entry.type === 'separator' || entry.type === 'label') return null;
                return (
                  <Button
                    key={entry.id}
                    variant="ghost"
                    fullWidth
                    {...(entry.icon ? { iconLeft: entry.icon } : {})}
                    onClick={() => {
                      setSheetFor(null);
                      entry.onSelect();
                    }}
                  >
                    {entry.label}
                  </Button>
                );
              })}
            </SheetActions>
          </>
        ) : null}
      </MWBottomSheet>

      {toast ? (
        <Toast
          title={toast.title}
          tone={toast.tone}
          duration={UNDO_MS}
          onClose={() => setToast(null)}
          {...(toast.undo ? { action: { label: 'Undo', onClick: toast.undo } } : {})}
        />
      ) : null}
    </Main>
  );
}
