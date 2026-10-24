import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Bell,
  Ban,
  ChevronDown,
  Clock,
  Download,
  Eye,
  Inbox,
  LayoutTemplate,
  Link2,
  PenLine,
  Search,
  ShieldCheck,
  Smartphone,
  Tag as TagIcon,
  Trash2,
  Undo2,
  Upload,
  X,
  XCircle,
  FilePen,
  CircleCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import type { EnvelopeListItem } from 'shared';
import { Banner } from '@/components/Banner';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Menu, MenuAnchor } from '@/components/Menu';
import type { MenuEntry } from '@/components/Menu';
import { Skeleton } from '@/components/Skeleton';
import { Toast } from '@/components/Toast';
import type { ToastProps } from '@/components/Toast';
import {
  DASHBOARD_TABS,
  EMPTY_VIEW,
  addTagToEnvelopes,
  applyView,
  canRemind,
  copyDocumentLink,
  downloadEnvelopes,
  fixBouncedEmail,
  formatTurnaround,
  groupByRecency,
  hasActiveFilters,
  needsYouCards,
  remindEnvelopes,
  removeEnvelopes,
  rowStatus,
  tabCounts,
  uniquePeople,
  uniqueTags,
} from '@/features/dashboard';
import type {
  ActionSummary,
  DashboardTab,
  NeedsCard,
  RowStatus,
  ViewFilters,
} from '@/features/dashboard';
import { envelopeKeys, useEnvelopesQuery, useUnsendEnvelopeMutation } from '@/features/envelopes';
import { useIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { useAuth } from '@/providers/AuthProvider';
import { ConfirmDialog } from './ConfirmDialog';
import {
  AvgMeta,
  BulkBar,
  Footer,
  GroupLabel,
  HeaderRow,
  HeaderSearch,
  Inner,
  Main,
  MobileActionBar,
  MobileGroup,
  PageTitle,
  SkeletonRow,
  SkeletonStack,
  SplitGroup,
  Tab,
  TabList,
  TableShell,
  TabsRow,
  THead,
  CountPill,
  RowCheck,
  Spacer,
} from './DashboardPage.styles';
import { DocumentRow } from './DocumentRow';
import { FirstRun } from './FirstRun';
import { HomeToolbar } from './HomeToolbar';
import { FilterSheet, RowSheet } from './MobileSheets';
import type { SheetAction } from './MobileSheets';
import { NeedsYouStrip } from './NeedsYouStrip';
import { TagDialog } from './TagDialog';

const TAB_META: Record<DashboardTab, { label: string; icon: LucideIcon }> = {
  all: { label: 'All', icon: Inbox },
  you: { label: 'To sign', icon: PenLine },
  others: { label: 'Waiting', icon: Clock },
  sealed: { label: 'Sealed', icon: ShieldCheck },
  drafts: { label: 'Drafts', icon: FilePen },
  stopped: { label: 'Stopped', icon: XCircle },
};

/** Undo stays on screen this long after Send. */
const UNDO_MS = 5000;
/** The new row keeps its highlight this long. */
const FRESH_MS = 5000;

interface ToastSpec {
  readonly kind: 'sent' | 'undone' | 'info' | 'error';
  readonly title: string;
  readonly envelopeId?: string;
}

interface PendingConfirm {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly run: () => Promise<void>;
}

function parseTab(raw: string | null): DashboardTab {
  return DASHBOARD_TABS.find((t) => t === raw) ?? 'all';
}

function removeTitle(single: EnvelopeListItem | undefined, count: number): string {
  if (single === undefined) return `Remove ${plural(count, 'document', 'documents')}?`;
  return single.status === 'draft' ? 'Delete this draft?' : 'Cancel this request?';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * The Documents home (`/documents`): what needs you, status tabs with
 * counts, search and filters, a table grouped by recency, bulk actions,
 * and the landing spot after Send (toast with Undo + a highlighted row).
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const mobile = useIsMobileViewport();
  const { user } = useAuth();
  const viewerEmail = user?.email ?? null;

  const query = useEnvelopesQuery(true, { limit: 100, sort: 'date', dir: 'desc' });
  const items = useMemo<ReadonlyArray<EnvelopeListItem>>(
    () => query.data?.items ?? [],
    [query.data],
  );
  const loading = query.isPending;
  const hasMore = (query.data?.next_cursor ?? null) !== null;
  const [now, setNow] = useState(() => new Date());
  useEffect(() => setNow(new Date()), [items]);

  const [filters, setFilters] = useState<ViewFilters>(() => ({
    ...EMPTY_VIEW,
    tab: parseTab(searchParams.get('tab')),
  }));
  const patchFilters = useCallback(
    (patch: Partial<ViewFilters>): void => setFilters((f) => ({ ...f, ...patch })),
    [],
  );
  const clearFilters = useCallback(
    (): void => setFilters((f) => ({ ...EMPTY_VIEW, tab: f.tab, sort: f.sort })),
    [],
  );

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [needsExpanded, setNeedsExpanded] = useState(false);
  const [filterSheet, setFilterSheet] = useState(false);
  /** Phones: the search field opens from the header's search button. */
  const [mobileSearch, setMobileSearch] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const newChevronRef = useRef<HTMLButtonElement | null>(null);
  const [tagFor, setTagFor] = useState<ReadonlyArray<EnvelopeListItem> | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [toast, setToast] = useState<ToastSpec | null>(null);
  const [freshId, setFreshId] = useState<string | null>(null);

  const unsend = useUnsendEnvelopeMutation();

  // After Send the editor navigates here with `{ justSent: envelopeId }`.
  const justSent = (location.state as { justSent?: unknown } | null)?.justSent;
  useEffect(() => {
    if (typeof justSent !== 'string') return;
    setToast({ kind: 'sent', title: 'Sent', envelopeId: justSent });
    setFreshId(justSent);
    queryClient.invalidateQueries({ queryKey: envelopeKeys.lists() });
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [justSent, location.pathname, location.search, navigate, queryClient]);

  useEffect(() => {
    if (freshId === null) return undefined;
    const t = setTimeout(() => setFreshId(null), FRESH_MS);
    return () => clearTimeout(t);
  }, [freshId]);

  const sentSignerCount =
    toast?.kind === 'sent'
      ? items.find((e) => e.id === toast.envelopeId)?.signers.length
      : undefined;

  const counts = useMemo(() => tabCounts(items, viewerEmail), [items, viewerEmail]);
  const visible = useMemo(
    () => applyView(items, filters, viewerEmail, now),
    [items, filters, viewerEmail, now],
  );
  const groups = useMemo(() => groupByRecency(visible, now), [visible, now]);
  const cards = useMemo(() => needsYouCards(items, viewerEmail, now), [items, viewerEmail, now]);
  const people = useMemo(() => uniquePeople(items), [items]);
  const tags = useMemo(() => uniqueTags(items), [items]);
  const avg = useMemo(() => formatTurnaround(items), [items]);
  const filtered = hasActiveFilters(filters);
  const firstRun = !loading && !query.isError && items.length === 0;

  const selectedItems = useMemo(
    () => visible.filter((e) => selected.has(e.id)),
    [visible, selected],
  );
  const allVisibleSelected = visible.length > 0 && selectedItems.length === visible.length;
  const bulkOn = selected.size > 0;

  const say = useCallback(
    (title: string, kind: ToastSpec['kind'] = 'info'): void => setToast({ kind, title }),
    [],
  );

  const refresh = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: envelopeKeys.lists() });
  }, [queryClient]);

  const summarize = useCallback(
    (done: string, s: ActionSummary, failure: string): void => {
      if (s.failed > 0 && s.ok === 0) {
        say(s.firstError === 'remind_throttled' ? 'Reminded recently' : failure, 'error');
      } else if (s.ok === 0) {
        say('Nothing to do');
      } else {
        say(s.failed > 0 ? `${done} · ${s.failed} failed` : done);
      }
      refresh();
    },
    [say, refresh],
  );

  const openDocument = useCallback(
    (id: string): void => {
      void navigate(`/document/${id}`);
    },
    [navigate],
  );

  const remind = useCallback(
    async (envs: ReadonlyArray<EnvelopeListItem>): Promise<void> => {
      const s = await remindEnvelopes(envs, viewerEmail);
      summarize(plural(s.ok, 'reminder sent', 'reminders sent'), s, 'Could not send reminder');
    },
    [viewerEmail, summarize],
  );

  const download = useCallback(
    async (envs: ReadonlyArray<EnvelopeListItem>): Promise<void> => {
      const s = await downloadEnvelopes(envs);
      summarize('Download started', s, 'Could not download');
    },
    [summarize],
  );

  const onPrimary = useCallback(
    (env: EnvelopeListItem, status: RowStatus): void => {
      if (status === 'others') void remind([env]);
      else if (status === 'sealed') void download([env]);
      else openDocument(env.id);
    },
    [remind, download, openDocument],
  );

  const askRemove = useCallback(
    (envs: ReadonlyArray<EnvelopeListItem>): void => {
      const drafts = envs.filter((e) => e.status === 'draft').length;
      const out = envs.filter(
        (e) => e.status === 'awaiting_others' || e.status === 'sealing',
      ).length;
      if (drafts + out === 0) {
        setToast({ kind: 'info', title: 'Sealed documents cannot be removed' });
        return;
      }
      const single = envs.length === 1 ? envs[0] : undefined;
      setConfirm({
        title: removeTitle(single, drafts + out),
        description:
          out > 0
            ? 'Signers who have not signed will be told it was withdrawn.'
            : 'This cannot be undone.',
        confirmLabel: single && single.status !== 'draft' ? 'Cancel request' : 'Delete',
        run: async () => {
          const s = await removeEnvelopes(envs);
          summarize(plural(s.ok, 'document removed', 'documents removed'), s, 'Could not remove');
          setSelected(new Set());
        },
      });
    },
    [summarize],
  );

  const rowActions = useCallback(
    (env: EnvelopeListItem): SheetAction[] => {
      const out: SheetAction[] = [
        { id: 'open', label: 'Open', icon: Eye, onSelect: () => openDocument(env.id) },
      ];
      if (canRemind(env)) {
        out.push({
          id: 'remind',
          label: 'Remind all',
          icon: Bell,
          onSelect: () => void remind([env]),
        });
      }
      if (env.status === 'completed') {
        out.push({
          id: 'download',
          label: 'Download',
          icon: Download,
          onSelect: () => void download([env]),
        });
      }
      out.push(
        {
          id: 'copy',
          label: 'Copy link',
          icon: Link2,
          onSelect: () =>
            void copyDocumentLink(env.id).then((ok) =>
              say(ok ? 'Link copied' : 'Could not copy', ok ? 'info' : 'error'),
            ),
        },
        { id: 'tag', label: 'Add tag', icon: TagIcon, onSelect: () => setTagFor([env]) },
      );
      if (env.status === 'draft' || env.status === 'awaiting_others' || env.status === 'sealing') {
        out.push({
          id: 'remove',
          label: env.status === 'draft' ? 'Delete draft' : 'Cancel request',
          icon: env.status === 'draft' ? Trash2 : Ban,
          danger: true,
          onSelect: () => askRemove([env]),
        });
      }
      return out;
    },
    [openDocument, remind, download, say, askRemove],
  );

  const menuEntries = useCallback(
    (env: EnvelopeListItem): MenuEntry[] => {
      const entries: MenuEntry[] = [];
      for (const a of rowActions(env)) {
        if (a.danger === true) entries.push({ type: 'separator', id: `sep-${a.id}` });
        entries.push({
          id: a.id,
          label: a.label,
          icon: a.icon,
          danger: a.danger === true,
          onSelect: a.onSelect,
        });
      }
      return entries;
    },
    [rowActions],
  );

  const toggleSelected = useCallback((id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback((): void => {
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((e) => e.id)));
  }, [allVisibleSelected, visible]);

  const clearSelection = useCallback((): void => {
    setSelected(new Set());
    setSelecting(false);
  }, []);

  const handleUndo = useCallback(
    (id: string): void => {
      unsend
        .mutateAsync(id)
        .then(() => {
          setFreshId(null);
          setToast({ kind: 'undone', title: 'Send cancelled · Saved as draft' });
        })
        .catch(() => setToast({ kind: 'error', title: 'Too late to undo' }));
    },
    [unsend],
  );

  const handleNeedsAct = useCallback(
    (card: NeedsCard): void => {
      if (card.kind === 'others') void remind([card.envelope]);
      else openDocument(card.envelope.id);
    },
    [remind, openDocument],
  );

  const handleFixEmail = useCallback(
    async (card: NeedsCard, email: string): Promise<void> => {
      if (card.signer === undefined) return;
      try {
        await fixBouncedEmail(card.envelope.id, card.signer.id, email);
        say(`Resent to ${email}`);
        refresh();
      } catch {
        say('Could not resend', 'error');
      }
    },
    [say, refresh],
  );

  const runConfirm = useCallback((): void => {
    if (confirm === null) return;
    setConfirmBusy(true);
    confirm.run().finally(() => {
      setConfirmBusy(false);
      setConfirm(null);
    });
  }, [confirm]);

  const newMenuItems: MenuEntry[] = [
    { id: 'upload', label: 'Upload file', icon: Upload, onSelect: () => navigate('/document/new') },
    {
      id: 'template',
      label: 'From template',
      icon: LayoutTemplate,
      onSelect: () => navigate('/templates'),
    },
    { id: 'scan', label: 'Scan with phone', icon: Smartphone, onSelect: () => navigate('/scan') },
  ];

  const sheetEnvelope = sheetFor === null ? undefined : items.find((e) => e.id === sheetFor);

  let toastProps: ToastProps | null = null;
  if (toast !== null) {
    const base = { onClose: () => setToast(null), 'aria-label': undefined };
    if (toast.kind === 'sent') {
      const id = toast.envelopeId ?? '';
      toastProps = {
        ...base,
        title:
          sentSignerCount === undefined
            ? 'Sent'
            : `Sent to ${plural(sentSignerCount, 'signer', 'signers')}`,
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => handleUndo(id) },
      };
    } else if (toast.kind === 'undone') {
      toastProps = { ...base, title: toast.title, icon: Undo2, duration: 4000 };
    } else {
      toastProps = {
        ...base,
        title: toast.title,
        tone: toast.kind === 'error' ? 'error' : 'info',
        duration: 4000,
      };
    }
  }

  const tableBody = (): ReactNode => {
    if (loading) {
      return Array.from({ length: 6 }, (_, i) => (
        <SkeletonRow key={i} aria-hidden>
          <Skeleton width={16} height={16} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Skeleton variant="rect" width={32} height={40} />
            <SkeletonStack>
              <Skeleton width="70%" height={12} />
              <Skeleton width="45%" height={10} />
            </SkeletonStack>
          </div>
          {mobile ? null : (
            <>
              <Skeleton variant="pill" width={88} height={24} />
              <Skeleton width={120} height={28} />
              <Skeleton width={48} height={10} />
              <span />
            </>
          )}
        </SkeletonRow>
      ));
    }
    if (visible.length === 0) {
      if (filters.tab === 'you' && !filtered && counts.you === 0) {
        return (
          <EmptyState
            icon={CircleCheck}
            title="All caught up"
            action={
              <Button variant="secondary" onClick={() => patchFilters({ tab: 'others' })}>
                View waiting
              </Button>
            }
          />
        );
      }
      return (
        <EmptyState
          icon={Search}
          title={filtered ? 'No matches' : 'Nothing here'}
          action={
            filtered ? (
              <Button variant="secondary" onClick={clearFilters}>
                Clear search
              </Button>
            ) : undefined
          }
        />
      );
    }
    const renderRow = (env: EnvelopeListItem) => (
      <DocumentRow
        key={env.id}
        envelope={env}
        viewerEmail={viewerEmail}
        now={now}
        selected={selected.has(env.id)}
        fresh={freshId === env.id}
        selectable={!mobile || selecting}
        mobile={mobile}
        menuItems={menuEntries(env)}
        onToggleSelected={() => toggleSelected(env.id)}
        onOpen={() => openDocument(env.id)}
        onPrimary={(status) => onPrimary(env, status)}
        onOpenSheet={() => setSheetFor(env.id)}
      />
    );
    return groups.map((g) =>
      mobile ? (
        <MobileGroup key={g.key}>
          <GroupLabel>{g.label}</GroupLabel>
          {g.items.map(renderRow)}
        </MobileGroup>
      ) : (
        <section key={g.key} aria-label={g.label}>
          <GroupLabel>{g.label}</GroupLabel>
          {g.items.map(renderRow)}
        </section>
      ),
    );
  };

  return (
    <Main>
      <Inner>
        <HeaderRow>
          <PageTitle>Documents</PageTitle>
          {mobile ? (
            <HeaderSearch>
              <Button
                variant="ghost"
                iconOnly
                iconLeft={Search}
                aria-label="Search"
                aria-expanded={mobileSearch}
                onClick={() => setMobileSearch((o) => !o)}
              />
            </HeaderSearch>
          ) : null}
          <MenuAnchor>
            <SplitGroup>
              <Button variant="primary" iconLeft={Upload} onClick={() => navigate('/document/new')}>
                New document
              </Button>
              <Button
                ref={newChevronRef}
                variant="primary"
                iconOnly
                iconLeft={ChevronDown}
                aria-label="More ways to start"
                aria-haspopup="menu"
                aria-expanded={newMenuOpen}
                onClick={() => setNewMenuOpen((o) => !o)}
              />
            </SplitGroup>
            <Menu
              open={newMenuOpen}
              onClose={() => setNewMenuOpen(false)}
              items={newMenuItems}
              anchorRef={newChevronRef}
              aria-label="New document"
            />
          </MenuAnchor>
        </HeaderRow>

        {query.isError ? (
          <Banner
            tone="error"
            action={
              <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
                Retry
              </Button>
            }
          >
            Could not load your documents
          </Banner>
        ) : null}

        {firstRun ? (
          <FirstRun
            onUpload={() => navigate('/document/new')}
            onTemplate={() => navigate('/templates')}
          />
        ) : (
          <>
            <NeedsYouStrip
              cards={cards}
              loading={loading}
              expanded={needsExpanded}
              onToggleExpanded={() => setNeedsExpanded((v) => !v)}
              onOpen={(card) => openDocument(card.envelope.id)}
              onAct={handleNeedsAct}
              onFixEmail={handleFixEmail}
            />

            <TabsRow>
              <TabList role="tablist" aria-label="Status">
                {DASHBOARD_TABS.map((key) => {
                  const meta = TAB_META[key];
                  const Icon = meta.icon;
                  const active = filters.tab === key;
                  return (
                    <Tab
                      key={key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      $active={active}
                      onClick={() => patchFilters({ tab: key })}
                    >
                      <Icon size={mobile ? 14 : 16} aria-hidden />
                      {meta.label}
                      {loading ? (
                        <Skeleton variant="circle" width={20} height={20} />
                      ) : (
                        <CountPill
                          $accent={active && !mobile}
                          aria-label={`${counts[key]} documents`}
                        >
                          {counts[key]}
                        </CountPill>
                      )}
                    </Tab>
                  );
                })}
              </TabList>
              {avg !== null ? (
                <AvgMeta>
                  <Clock size={14} aria-hidden />
                  {avg} avg
                </AvgMeta>
              ) : null}
            </TabsRow>

            {bulkOn ? (
              <BulkBar role="toolbar" aria-label="Bulk actions">
                {mobile ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    iconOnly
                    iconLeft={X}
                    aria-label="Clear selection"
                    onClick={clearSelection}
                  />
                ) : null}
                <span>{`${selected.size} selected`}</span>
                {mobile ? null : (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={Bell}
                      onClick={() => void remind(selectedItems)}
                    >
                      Remind
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={Download}
                      onClick={() => void download(selectedItems)}
                    >
                      Download
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={TagIcon}
                      onClick={() => setTagFor(selectedItems)}
                    >
                      Tag
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      iconLeft={Trash2}
                      onClick={() => askRemove(selectedItems)}
                    >
                      Delete
                    </Button>
                    <Spacer />
                    <Button
                      size="sm"
                      variant="ghost"
                      iconOnly
                      iconLeft={X}
                      aria-label="Clear selection"
                      onClick={clearSelection}
                    />
                  </>
                )}
              </BulkBar>
            ) : (
              <HomeToolbar
                filters={filters}
                onChange={patchFilters}
                onClear={clearFilters}
                people={people}
                tags={tags}
                mobile={mobile}
                onOpenFilterSheet={() => setFilterSheet(true)}
                onStartSelecting={() => setSelecting(true)}
                searchOpen={mobileSearch}
                resultCount={loading ? undefined : visible.length}
              />
            )}

            {mobile && selecting && !bulkOn ? (
              <BulkBar role="toolbar" aria-label="Selecting">
                <Button
                  variant="ghost"
                  size="sm"
                  iconOnly
                  iconLeft={X}
                  aria-label="Clear selection"
                  onClick={clearSelection}
                />
                <span>Select documents</span>
              </BulkBar>
            ) : null}

            <TableShell>
              {!mobile && !loading && visible.length > 0 ? (
                <THead role="row">
                  <RowCheck
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    aria-label="Select all"
                  />
                  <span>Document</span>
                  <span>Status</span>
                  <span>Signers</span>
                  <span>Updated</span>
                  <span />
                </THead>
              ) : null}
              {tableBody()}
            </TableShell>

            {!loading ? (
              <Footer aria-live="polite">
                {plural(visible.length, 'document', 'documents')}
                {hasMore ? ' (more available)' : ''}
              </Footer>
            ) : null}
          </>
        )}
      </Inner>

      {toastProps !== null ? <Toast {...toastProps} /> : null}

      {mobile && bulkOn ? (
        <MobileActionBar role="toolbar" aria-label="Selection actions">
          <button type="button" onClick={() => void remind(selectedItems)}>
            <Bell size={20} aria-hidden />
            Remind
          </button>
          <button type="button" onClick={() => void download(selectedItems)}>
            <Download size={20} aria-hidden />
            Download
          </button>
          <button type="button" onClick={() => setTagFor(selectedItems)}>
            <TagIcon size={20} aria-hidden />
            Tag
          </button>
          <button type="button" data-danger="true" onClick={() => askRemove(selectedItems)}>
            <Trash2 size={20} aria-hidden />
            Delete
          </button>
        </MobileActionBar>
      ) : null}

      {mobile ? (
        <>
          <FilterSheet
            open={filterSheet}
            onClose={() => setFilterSheet(false)}
            filters={filters}
            onChange={patchFilters}
            onReset={clearFilters}
            people={people}
            tags={tags}
            resultCount={visible.length}
          />
          {sheetEnvelope ? (
            <RowSheet
              open
              onClose={() => setSheetFor(null)}
              title={sheetEnvelope.title}
              status={rowStatus(sheetEnvelope, viewerEmail)}
              actions={rowActions(sheetEnvelope)}
              onOpenDocument={() => openDocument(sheetEnvelope.id)}
            />
          ) : null}
        </>
      ) : null}

      {tagFor !== null ? (
        <TagDialog
          count={tagFor.length}
          onCancel={() => setTagFor(null)}
          onSave={(tag) => {
            const envs = tagFor;
            setTagFor(null);
            void addTagToEnvelopes(envs, tag).then((s) =>
              summarize(plural(s.ok, 'document tagged', 'documents tagged'), s, 'Could not tag'),
            );
          }}
        />
      ) : null}

      {confirm !== null ? (
        <ConfirmDialog
          title={confirm.title}
          description={confirm.description}
          confirmLabel={confirm.confirmLabel}
          busy={confirmBusy}
          onCancel={() => setConfirm(null)}
          onConfirm={runConfirm}
        />
      ) : null}
    </Main>
  );
}
