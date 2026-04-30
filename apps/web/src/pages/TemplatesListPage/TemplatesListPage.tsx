import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { TagEditorPopover } from '@/components/TagEditorPopover';
import { TemplateCard } from '@/components/TemplateCard';
import {
  duplicateTemplate,
  getTemplates,
  setTemplates as publishTemplates,
  subscribeToTemplates,
  tagColorFor,
} from '@/features/templates';
import {
  deleteTemplate as apiDeleteTemplate,
  listTemplates,
  updateTemplate as apiUpdateTemplate,
} from '@/features/templates/templatesApi';
import type { TemplateSummary } from '@/features/templates';
import { TagFilterMenu } from '@/components/TagFilterMenu';
import {
  ActiveTagOverflow,
  ActiveTagPill,
  ActiveTagRemove,
  CreateBadge,
  CreateBody,
  CreateCard,
  CreateSub,
  CreateThumb,
  CreateTitle,
  EmptyState,
  Grid,
  GroupCount,
  GroupHeader,
  GroupRule,
  GroupSection,
  GroupTagDot,
  GroupTagPill,
  GroupToggleLabel,
  HeaderRow,
  HeaderTitle,
  Inner,
  Lede,
  Main,
  ModalBackdrop,
  ModalBody,
  ModalCancelButton,
  ModalCard,
  ModalDeleteButton,
  ModalFooter,
  ModalHead,
  ModalIcon,
  ModalTitle,
  SearchBox,
  Toolbar,
  ToolbarSpacer,
} from './TemplatesListPage.styles';

const ACTIVE_TAG_VISIBLE = 3;

function matchesQuery(template: TemplateSummary, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (template.name.toLowerCase().includes(q)) return true;
  if (template.description && template.description.toLowerCase().includes(q)) return true;
  if ((template.tags ?? []).some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

export interface TemplatesListPageProps {
  /**
   * Pre-seed the list. Production passes nothing — `TEMPLATES` is the
   * empty array (templates are user-authored, not pre-baked). Tests +
   * Storybook stories pass `SAMPLE_TEMPLATES` to render the populated
   * layout without re-introducing seed data in the shipped bundle.
   */
  readonly initialTemplates?: ReadonlyArray<TemplateSummary>;
}

/**
 * L4 page — `/templates`. Mirrors the design guide's TemplatesList:
 *
 *   - Serif "Templates" + lede "Place fields once. Reuse forever."
 *   - Tag filter menu, active-tag chip strip, group-by-tag toggle,
 *     search-by-name-or-tag input
 *   - 4:3 thumbnail cards with accents, tag pills, hover overlay
 *     (Tags / Edit / Use / Delete)
 *   - Centered delete confirmation modal
 *   - Centered tag editor popover (anchored from the card overlay)
 */
export function TemplatesListPage({ initialTemplates }: TemplatesListPageProps = {}) {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<ReadonlyArray<TemplateSummary>>(
    () => initialTemplates ?? getTemplates(),
  );
  // Test seed: when `initialTemplates` is supplied, publish to the
  // store so sibling pages reading via subscribers see the same data.
  useEffect(() => {
    if (initialTemplates) publishTemplates(initialTemplates);
  }, [initialTemplates]);

  // Subscribe to module-store mutations from elsewhere (Save-as-template
  // on the editor, etc.).
  useEffect(() => {
    return subscribeToTemplates(() => {
      setTemplates(getTemplates());
    });
  }, []);

  // Hydrate from the server unless tests pre-seeded.
  useEffect(() => {
    if (initialTemplates) return undefined;
    const ac = new AbortController();
    listTemplates(ac.signal)
      .then((rows) => {
        publishTemplates(rows);
      })
      .catch((err) => {
        // Soft fail — guests + offline see the empty list.
        // eslint-disable-next-line no-console
        console.warn('[templates] list fetch failed:', err);
      });
    return () => ac.abort();
  }, [initialTemplates]);

  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [activeTags, setActiveTags] = useState<ReadonlyArray<string>>([]);
  const [groupByTag, setGroupByTag] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TemplateSummary | null>(null);
  const [editTagsFor, setEditTagsFor] = useState<TemplateSummary | null>(null);

  // Derived sets ---------------------------------------------------------

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const t of templates) for (const tag of t.tags ?? []) set.add(tag);
    return Array.from(set).sort();
  }, [templates]);

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of templates) {
      for (const tag of t.tags ?? []) counts[tag] = (counts[tag] ?? 0) + 1;
    }
    return counts;
  }, [templates]);

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (activeTags.length > 0 && !activeTags.every((at) => (t.tags ?? []).includes(at))) {
        return false;
      }
      return matchesQuery(t, deferredQuery);
    });
  }, [templates, deferredQuery, activeTags]);

  const grouped = useMemo(() => {
    if (!groupByTag) return null;
    const map: Record<string, TemplateSummary[]> = {};
    for (const t of filtered) {
      const tags = (t.tags ?? []).length > 0 ? (t.tags ?? []) : ['Untagged'];
      for (const tag of tags) {
        const bucket = map[tag];
        if (bucket) bucket.push(t);
        else map[tag] = [t];
      }
    }
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((tag) => ({ tag, items: map[tag] ?? [] }));
  }, [filtered, groupByTag]);

  // Mutations ------------------------------------------------------------

  const toggleActiveTag = useCallback((tag: string) => {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const clearActiveTags = useCallback(() => setActiveTags([]), []);

  const handleCreate = useCallback((): void => {
    navigate('/templates/new/use');
  }, [navigate]);

  const handleUse = useCallback(
    (template: TemplateSummary): void => {
      navigate(`/templates/${encodeURIComponent(template.id)}/use`);
    },
    [navigate],
  );

  const handleEdit = useCallback(
    (template: TemplateSummary): void => {
      navigate(`/templates/${encodeURIComponent(template.id)}/use?mode=edit`);
    },
    [navigate],
  );

  const handleDuplicate = useCallback((template: TemplateSummary): void => {
    setTemplates((prev) => {
      const copy = duplicateTemplate(template);
      const idx = prev.findIndex((t) => t.id === template.id);
      const next =
        idx === -1 ? [...prev, copy] : [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
      publishTemplates(next);
      return next;
    });
  }, []);

  const handleConfirmDelete = useCallback((template: TemplateSummary): void => {
    setConfirmDelete(template);
  }, []);

  // Optimistic delete — drop locally, then call the server.
  const performDelete = useCallback((template: TemplateSummary): void => {
    setTemplates((prev) => {
      const next = prev.filter((t) => t.id !== template.id);
      publishTemplates(next);
      return next;
    });
    setConfirmDelete(null);
    void apiDeleteTemplate(template.id).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[templates] delete failed; refetching:', err);
      void listTemplates()
        .then(publishTemplates)
        .catch(() => undefined);
    });
  }, []);

  /**
   * Persist a tag mutation: update the local store optimistically so
   * the UI reacts instantly, then PATCH `/templates/:id` with the new
   * `tags` array. If the server rejects the patch, refetch the list
   * to roll local state back. Pure-local mode (when `initialTemplates`
   * is supplied for tests / Storybook) skips the network call so
   * jsdom + stories don't fight an unreachable API.
   *
   * `nextTags` is computed synchronously from the module store BEFORE
   * scheduling the React state update — reading it from inside a
   * `setTemplates(updater)` closure was unreliable under StrictMode
   * (the updater runs twice in dev) and risked PATCHing with stale
   * `[]`.
   */
  const updateTemplateTags = useCallback(
    (templateId: string, mutate: (tags: ReadonlyArray<string>) => ReadonlyArray<string>): void => {
      const current = getTemplates();
      const target = current.find((t) => t.id === templateId);
      if (!target) return;
      const nextTags = mutate(target.tags ?? []);
      const next = current.map((t) => (t.id === templateId ? { ...t, tags: nextTags } : t));
      publishTemplates(next);
      // Tests / Storybook with `initialTemplates` skip the network —
      // local state is the source of truth in that mode.
      if (initialTemplates) return;
      void apiUpdateTemplate(templateId, { tags: nextTags }).catch((err) => {
        // eslint-disable-next-line no-console
        console.warn('[templates] tag update failed; refetching:', err);
        void listTemplates()
          .then(publishTemplates)
          .catch(() => undefined);
      });
    },
    [initialTemplates],
  );

  const toggleTemplateTag = useCallback(
    (templateId: string, tag: string): void => {
      updateTemplateTags(templateId, (tags) =>
        tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag],
      );
    },
    [updateTemplateTags],
  );

  const createTemplateTag = useCallback(
    (templateId: string, tag: string): void => {
      const clean = tag.trim();
      if (!clean) return;
      updateTemplateTags(templateId, (tags) => (tags.includes(clean) ? tags : [...tags, clean]));
    },
    [updateTemplateTags],
  );

  // Keep the open tag-editor popover in sync with the canonical
  // template record so its checkboxes reflect the latest `tags` after
  // a toggle/create. Previously `setEditTagsFor` was duplicated inside
  // each mutation; deriving from `templates` keeps a single source of
  // truth (rule 4.2 — local state, then derive).
  const editTargetTemplate = useMemo(
    () => (editTagsFor ? (templates.find((t) => t.id === editTagsFor.id) ?? editTagsFor) : null),
    [editTagsFor, templates],
  );

  const isFiltered = query.length > 0 || activeTags.length > 0;

  const newTemplateTile = (
    <CreateCard type="button" onClick={handleCreate} aria-label="Create a new template">
      <CreateThumb aria-hidden>
        <CreateBadge>
          <Icon icon={Plus} size={26} />
        </CreateBadge>
      </CreateThumb>
      <CreateBody>
        <CreateTitle>New template</CreateTitle>
        <CreateSub>Upload a PDF, place fields once.</CreateSub>
      </CreateBody>
    </CreateCard>
  );

  return (
    <Main>
      <Inner>
        <HeaderRow>
          <div>
            <HeaderTitle>Templates</HeaderTitle>
            <Lede>Place fields once. Reuse forever.</Lede>
          </div>
          <Button
            variant="primary"
            iconLeft={Plus}
            onClick={handleCreate}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            New template
          </Button>
        </HeaderRow>

        <Toolbar>
          <TagFilterMenu
            allTags={allTags}
            counts={tagCounts}
            selected={activeTags}
            onToggle={toggleActiveTag}
            onClear={clearActiveTags}
          />

          {activeTags.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {activeTags.slice(0, ACTIVE_TAG_VISIBLE).map((tag) => {
                const c = tagColorFor(tag);
                return (
                  <ActiveTagPill key={tag} $bg={c.bg} $fg={c.fg}>
                    {tag}
                    <ActiveTagRemove
                      type="button"
                      aria-label={`Remove ${tag} filter`}
                      onClick={() => toggleActiveTag(tag)}
                    >
                      <Icon icon={X} size={10} />
                    </ActiveTagRemove>
                  </ActiveTagPill>
                );
              })}
              {activeTags.length > ACTIVE_TAG_VISIBLE ? (
                <ActiveTagOverflow>
                  +{activeTags.length - ACTIVE_TAG_VISIBLE} more
                </ActiveTagOverflow>
              ) : null}
            </div>
          ) : null}

          <ToolbarSpacer />

          <GroupToggleLabel>
            <input
              type="checkbox"
              checked={groupByTag}
              onChange={(e) => setGroupByTag(e.target.checked)}
            />
            Group by tag
          </GroupToggleLabel>

          <SearchBox>
            <Icon icon={Search} size={14} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or tag"
              aria-label="Search by name or tag"
            />
          </SearchBox>
        </Toolbar>

        {groupByTag && grouped ? (
          <>
            {grouped.length === 0 ? (
              <EmptyState role="status">No templates match your filter.</EmptyState>
            ) : null}
            {grouped.map((g) => {
              const c = tagColorFor(g.tag);
              return (
                <GroupSection key={g.tag}>
                  <GroupHeader>
                    <GroupTagPill $bg={c.bg} $fg={c.fg}>
                      <GroupTagDot $color={c.fg} aria-hidden />
                      {g.tag}
                    </GroupTagPill>
                    <GroupCount>{g.items.length}</GroupCount>
                    <GroupRule aria-hidden />
                  </GroupHeader>
                  <Grid>
                    {g.items.map((t) => (
                      <TemplateCard
                        key={`${g.tag}-${t.id}`}
                        template={t}
                        onUse={handleUse}
                        onEdit={handleEdit}
                        onDelete={handleConfirmDelete}
                        onDuplicate={handleDuplicate}
                        onTagClick={(tag) => toggleActiveTag(tag)}
                        onEditTags={(tpl) => setEditTagsFor(tpl)}
                      />
                    ))}
                  </Grid>
                </GroupSection>
              );
            })}
          </>
        ) : (
          <>
            <Grid>
              {newTemplateTile}
              {filtered.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  onUse={handleUse}
                  onEdit={handleEdit}
                  onDelete={handleConfirmDelete}
                  onDuplicate={handleDuplicate}
                  onTagClick={(tag) => toggleActiveTag(tag)}
                  onEditTags={(tpl) => setEditTagsFor(tpl)}
                />
              ))}
            </Grid>
            {filtered.length === 0 && (query || isFiltered) ? (
              <EmptyState role="status">
                {query ? `No templates match "${query}".` : 'No templates match the selected tags.'}
              </EmptyState>
            ) : null}
          </>
        )}
      </Inner>

      {/* Delete confirmation modal — centered, mirrors the design guide. */}
      {confirmDelete ? (
        <ModalBackdrop role="presentation" onClick={() => setConfirmDelete(null)}>
          <ModalCard
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${confirmDelete.name}`}
            onClick={(e) => e.stopPropagation()}
          >
            <ModalHead>
              <ModalIcon aria-hidden>
                <Icon icon={Trash2} size={20} />
              </ModalIcon>
              <div>
                <ModalTitle>Delete this template?</ModalTitle>
                <ModalBody>
                  <b>{confirmDelete.name}</b> will be removed. Documents already sent are not
                  affected.
                </ModalBody>
              </div>
            </ModalHead>
            <ModalFooter>
              <ModalCancelButton type="button" onClick={() => setConfirmDelete(null)}>
                Cancel
              </ModalCancelButton>
              <ModalDeleteButton
                type="button"
                onClick={() => performDelete(confirmDelete)}
                aria-label={`Confirm delete ${confirmDelete.name}`}
              >
                <Icon icon={Trash2} size={14} />
                Delete template
              </ModalDeleteButton>
            </ModalFooter>
          </ModalCard>
        </ModalBackdrop>
      ) : null}

      <TagEditorPopover
        open={editTagsFor !== null}
        // Read tags off the canonical template record so the popover
        // reflects mutations immediately (instead of the stale snapshot
        // captured when `setEditTagsFor(template)` was called).
        currentTags={editTargetTemplate?.tags ?? []}
        allTags={allTags}
        onToggle={(tag) => {
          if (editTagsFor) toggleTemplateTag(editTagsFor.id, tag);
        }}
        onCreate={(tag) => {
          if (editTagsFor) createTemplateTag(editTagsFor.id, tag);
        }}
        onClose={() => setEditTagsFor(null)}
      />
    </Main>
  );
}
