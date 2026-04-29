import { useCallback, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { FilterTabs } from '@/components/FilterTabs';
import { Icon } from '@/components/Icon';
import { PageHeader } from '@/components/PageHeader';
import { TemplateCard } from '@/components/TemplateCard';
import { TEMPLATES } from '@/features/templates';
import type { TemplateSummary } from '@/features/templates';
import {
  CreateBadge,
  CreateCard,
  CreateSub,
  CreateTitle,
  Grid,
  HeaderSlot,
  Inner,
  Lede,
  Main,
} from './TemplatesListPage.styles';

type TabId = 'all' | 'mine' | 'shared';

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

/**
 * L4 page — `/templates`. Lists every template the current user has authored
 * and exposes a primary "New template" CTA that drops the user into the
 * upload flow with a `template=draft` flag, plus a "Use" action per card
 * that navigates to `/templates/:id/use` for preview-and-apply.
 */
export function TemplatesListPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabId>('all');

  const filtered = useMemo(() => {
    const def = TAB_DEFS.find((t) => t.id === tab) ?? TAB_DEFS[0]!;
    return TEMPLATES.filter(def.matches);
  }, [tab]);

  const tabItems = useMemo(
    () =>
      TAB_DEFS.map((def) => ({
        id: def.id,
        label: def.label,
        count: TEMPLATES.filter(def.matches).length,
      })),
    [],
  );

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

        <Grid>
          <CreateCard type="button" onClick={handleCreate} aria-label="Create a new template">
            <CreateBadge aria-hidden>
              <Icon icon={Plus} size={22} />
            </CreateBadge>
            <CreateTitle>New template</CreateTitle>
            <CreateSub>Upload a PDF, place fields once, then reuse it forever.</CreateSub>
          </CreateCard>

          {filtered.map((t) => (
            <TemplateCard key={t.id} template={t} onUse={handleUse} onEdit={handleEdit} />
          ))}
        </Grid>
      </Inner>
    </Main>
  );
}
