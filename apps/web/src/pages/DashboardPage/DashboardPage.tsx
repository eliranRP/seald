import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';
import { ChevronRight, UploadCloud } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import type { BadgeTone } from '@/components/Badge/Badge.types';
import { Button } from '@/components/Button';
import { DocThumb } from '@/components/DocThumb';
import { EmptyState } from '@/components/EmptyState';
import { ColumnResizeHandle } from '@/components/ColumnResizeHandle';
import { EnvelopeIllustration } from '@/components/EnvelopeIllustration';
import { TagChip } from '@/components/TagChip';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { FilterToolbar } from '@/components/FilterToolbar';
import { PageHeader } from '@/components/PageHeader';
import { SignerProgressBar } from '@/components/SignerProgressBar';
import type { SignerProgressBarEntry } from '@/components/SignerProgressBar';
import { SignerStack } from '@/components/SignerStack';
import type { SignerStackEntry, SignerStackStatus } from '@/components/SignerStack';
import { Skeleton } from '@/components/Skeleton';
import { StatCard } from '@/components/StatCard';
import { useEnvelopesQuery } from '@/features/envelopes';
import type { EnvelopeListItem, EnvelopeStatus } from '@/features/envelopes';
import {
  filtersToQueryParams,
  isAwaitingYou,
  parseFilters,
  parseSort,
  serializeFilters,
  type EnvelopeFilters,
  type SortKey,
} from '@/features/dashboardFilters';
import { formatShortDate } from '@/lib/dateFormat';
import { useAuth } from '@/providers/AuthProvider';
import {
  CHEVRON_COL_PX,
  COLUMN_MIN_WIDTHS,
  ChevronCell,
  DEFAULT_COLUMN_WIDTHS,
  DateCell,
  DocCell,
  DocCode,
  DocTitle,
  HeadCell,
  HeaderSlot,
  Inner,
  Main,
  ProgressCell,
  SignersCell,
  SortCaret,
  SortHeaderButton,
  StatGrid,
  TableHead,
  TableRow,
  TableShell,
} from './DashboardPage.styles';

type ColKey = keyof typeof DEFAULT_COLUMN_WIDTHS;
const COLUMN_KEYS: ReadonlyArray<ColKey> = ['document', 'signers', 'progress', 'status', 'date'];
const COLUMN_LABELS: Record<ColKey, string> = {
  document: 'Document',
  signers: 'Signers',
  progress: 'Progress',
  status: 'Status',
  date: 'Date',
};
// The column id (the localStorage width key) maps to the sort key the
// API understands — only `document` differs (sorts by `title`).
const COLUMN_SORT_KEY: Record<ColKey, SortKey> = {
  document: 'title',
  signers: 'signers',
  progress: 'progress',
  status: 'status',
  date: 'date',
};
const COLUMN_SPECS = COLUMN_KEYS.map((k) => ({
  key: k,
  default: DEFAULT_COLUMN_WIDTHS[k],
  min: COLUMN_MIN_WIDTHS[k],
}));
const COLUMN_WIDTHS_STORAGE_KEY = 'seald.dashboard.columns.v1';

/** The "no filter at all" state — what `Clear filters` resets to. */
const EMPTY_FILTERS: EnvelopeFilters = {
  q: '',
  status: [],
  date: { kind: 'preset', preset: 'all' },
  signer: [],
  tags: [],
};

/**
 * The filter each clickable stat tile maps to. Clicking applies it
 * (replacing the current filter set); clicking the already-applied
 * tile clears every filter.
 */
const STAT_FILTERS = {
  awaitingYou: { ...EMPTY_FILTERS, status: ['awaiting_you'] },
  awaitingOthers: { ...EMPTY_FILTERS, status: ['awaiting_others'] },
  sealedThisMonth: {
    ...EMPTY_FILTERS,
    status: ['sealed'],
    date: { kind: 'preset', preset: 'thisMonth' },
  },
} as const satisfies Record<string, EnvelopeFilters>;

const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  awaiting_others: 'Awaiting others',
  sealing: 'Sealing',
  completed: 'Sealed',
  declined: 'Declined',
  expired: 'Expired',
  canceled: 'Canceled',
};

const STATUS_TONE: Record<EnvelopeStatus, BadgeTone> = {
  draft: 'neutral',
  awaiting_others: 'amber',
  sealing: 'indigo',
  completed: 'emerald',
  declined: 'red',
  expired: 'red',
  canceled: 'neutral',
};

/**
 * Compact date for the dashboard table. Always includes the year when
 * the envelope is from a different calendar year — see
 * `apps/web/src/lib/dateFormat.ts` and the BUG-2 regression test in
 * `dateFormat.test.ts`. Without the year, "Apr 02 2024" and
 * "Apr 02 2026" rendered identically and senders couldn't distinguish
 * "sent last week" from "sent two years ago".
 */
function formatDate(iso: string | null): string {
  return formatShortDate(iso);
}

/**
 * Map backend `SignerUiStatus` + envelope state → the narrower UI
 * status the SignerStack / SignerProgressBar components render. Note:
 * `awaiting-you` is sender-only and not reachable without co-signing,
 * so we fall back to `pending` for the "waiting-on-a-signer" case.
 */
function toStackStatus(
  envelope: EnvelopeListItem,
  signer: EnvelopeListItem['signers'][number],
): SignerStackStatus {
  if (signer.status === 'completed') return 'signed';
  if (signer.status === 'declined') return 'declined';
  if (envelope.status === 'draft') return 'draft';
  // Both 'awaiting' and 'viewing' collapse to 'pending' today.
  return 'pending';
}

function toStackEntries(envelope: EnvelopeListItem): ReadonlyArray<SignerStackEntry> {
  return envelope.signers.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    status: toStackStatus(envelope, s),
  }));
}

function toBarEntries(envelope: EnvelopeListItem): ReadonlyArray<SignerProgressBarEntry> {
  return envelope.signers.map((s) => ({
    id: s.id,
    status: toStackStatus(envelope, s),
  }));
}

/**
 * Median turnaround (in hours) between sent_at and completed_at across
 * completed envelopes. Format as "1.8d" when ≥ 24h, "14h" otherwise,
 * "—" when no completed envelopes are in the list.
 */
function formatTurnaround(list: ReadonlyArray<EnvelopeListItem>): string {
  const hours: number[] = [];
  for (const d of list) {
    if (d.status === 'completed' && d.sent_at && d.completed_at) {
      const sent = new Date(d.sent_at).getTime();
      const done = new Date(d.completed_at).getTime();
      if (!Number.isNaN(sent) && !Number.isNaN(done) && done > sent) {
        hours.push((done - sent) / (1000 * 60 * 60));
      }
    }
  }
  if (hours.length === 0) return '—';
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median = hours.length % 2 === 0 ? (hours[mid - 1]! + hours[mid]!) / 2 : hours[mid]!;
  if (median >= 24) return `${(median / 24).toFixed(1)}d`;
  return `${Math.round(median)}h`;
}

interface RenderDocumentsBodyArgs {
  readonly loading: boolean;
  readonly rowsForSkeleton: boolean;
  readonly filtered: ReadonlyArray<EnvelopeListItem>;
  readonly navigate: (path: string) => void;
  readonly viewerEmail: string | null;
  /** Live grid template — derived from useColumnWidths in the parent. */
  readonly gridTemplate: string;
}

function renderDocumentsBody(args: RenderDocumentsBodyArgs): JSX.Element | JSX.Element[] {
  const { loading, rowsForSkeleton, filtered, navigate, viewerEmail, gridTemplate } = args;
  if (loading && rowsForSkeleton) {
    return Array.from({ length: 6 }, (_, i) => (
      <TableRow key={`sk-${i}`} as="div" aria-hidden $grid={gridTemplate}>
        <DocCell>
          <Skeleton variant="rect" width={40} height={40} />
          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <Skeleton width={200} />
            <Skeleton width={80} />
          </div>
        </DocCell>
        <SignersCell>
          <Skeleton variant="rect" width={120} height={28} />
        </SignersCell>
        <ProgressCell>
          <Skeleton variant="rect" width={140} height={6} />
        </ProgressCell>
        <Skeleton variant="rect" width={110} height={22} />
        <DateCell>
          <Skeleton width={90} />
        </DateCell>
        <ChevronCell>
          <Skeleton variant="rect" width={16} height={16} />
        </ChevronCell>
      </TableRow>
    ));
  }
  if (filtered.length === 0) {
    return (
      <EmptyState>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
            paddingBlock: 24,
          }}
        >
          <EnvelopeIllustration size={140} />
          <span>No documents match these filters.</span>
        </div>
      </EmptyState>
    );
  }
  return filtered.map((d) => (
    <TableRow
      key={d.id}
      type="button"
      onClick={() => navigate(`/document/${d.id}`)}
      aria-label={`Open ${d.title}`}
      $grid={gridTemplate}
    >
      <DocCell>
        <DocThumb size={40} title={d.title} signed={d.status === 'completed'} />
        <div style={{ minWidth: 0 }}>
          <DocTitle>{d.title}</DocTitle>
          <DocCode>{d.short_code}</DocCode>
          {d.tags && d.tags.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {d.tags.slice(0, 3).map((t) => (
                <TagChip key={t} label={t} />
              ))}
              {d.tags.length > 3 ? (
                <span style={{ fontSize: 11, color: 'var(--ink-500)' }}>+{d.tags.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </DocCell>
      <SignersCell>
        <SignerStack signers={toStackEntries(d)} aria-label={`${d.title} signers`} />
      </SignersCell>
      <ProgressCell>
        <SignerProgressBar signers={toBarEntries(d)} aria-label={`${d.title} progress`} />
      </ProgressCell>
      <div>
        {/* If the dashboard viewer is one of this envelope's pending
            signers, show the actionable "Awaiting you" indigo badge
            instead of the generic amber "Awaiting others". */}
        {isAwaitingYou(d, viewerEmail) ? (
          <Badge tone="indigo">Awaiting you</Badge>
        ) : (
          <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
        )}
      </div>
      <DateCell>{formatDate(d.updated_at)}</DateCell>
      <ChevronCell aria-hidden>
        <ChevronRight size={16} />
      </ChevronCell>
    </TableRow>
  ));
}

/**
 * L4 page — the sender dashboard / inbox view listing every envelope
 * the user has created. Pulls from the live `/envelopes` endpoint,
 * which now embeds a signers snippet per item so we can render the
 * multi-signer `SignerStack` + `SignerProgressBar` without N+1 fetches.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Sort + filters both live in the URL and are applied server-side
  // (`GET /envelopes?sort=&dir=&q=&bucket=&date=&signer=&tags=`).
  const sort = useMemo(() => parseSort(searchParams), [searchParams]);
  const parsedFilters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const filterParams = useMemo(() => filtersToQueryParams(parsedFilters), [parsedFilters]);

  // Viewer email drives the "Awaiting you" predicate (toolbar counts +
  // the row badge).
  const { user } = useAuth();
  const viewerEmail = user?.email ?? null;

  // Table query — filtered + sorted by the server. Its `items` render
  // directly; no client-side filter/sort pass.
  const tableQuery = useEnvelopesQuery(true, {
    limit: 100,
    sort: sort.key,
    dir: sort.dir,
    ...filterParams,
  });
  const filtered: ReadonlyArray<EnvelopeListItem> = useMemo(
    () => tableQuery.data?.items ?? [],
    [tableQuery.data],
  );
  const documentsLoading = tableQuery.isPending;

  // Toolbar / stats query — the *unfiltered* list, so the chips' per-
  // bucket counts + distinct signer/tag lists stay accurate regardless
  // of the active filter. React Query de-duplicates this against the
  // table query whenever no filter is active (identical params).
  const facetsQuery = useEnvelopesQuery(true, { limit: 100, sort: 'date', dir: 'desc' });
  const allEnvelopes: ReadonlyArray<EnvelopeListItem> = useMemo(
    () => facetsQuery.data?.items ?? [],
    [facetsQuery.data],
  );

  // Header click cycle: not-active → asc; active+asc → desc;
  // active+desc → back to the default (strip both params).
  const handleSortClick = useCallback(
    (key: SortKey): void => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          const isActive = next.get('sort') === key;
          const curDir = next.get('dir');
          if (!isActive) {
            next.set('sort', key);
            next.set('dir', 'asc');
          } else if (curDir === 'asc') {
            next.set('sort', key);
            next.set('dir', 'desc');
          } else {
            next.delete('sort');
            next.delete('dir');
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Stat-tile click → replace the filter facets with `next` (keeping
  // whatever sort is active). Used by the clickable KPI tiles below.
  const applyStatFilter = useCallback(
    (next: EnvelopeFilters): void => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(serializeFilters(next));
          const sortKey = prev.get('sort');
          const sortDir = prev.get('dir');
          if (sortKey) params.set('sort', sortKey);
          if (sortDir) params.set('dir', sortDir);
          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Per-user column widths persisted in localStorage (piece 3 of the
  // single-screen-with-filters request). The hook gives us the live
  // map + a setter the resize handles call on every pointer-move;
  // the grid template is recomputed each render from those values.
  const { widths, setWidth } = useColumnWidths(COLUMN_SPECS, COLUMN_WIDTHS_STORAGE_KEY);
  const gridTemplate = useMemo(
    () =>
      `${COLUMN_KEYS.map((k) => `${widths[k] ?? DEFAULT_COLUMN_WIDTHS[k]}px`).join(' ')} ${CHEVRON_COL_PX}px`,
    [widths],
  );

  const stats = useMemo<
    ReadonlyArray<{
      readonly label: string;
      readonly value: string;
      readonly tone: BadgeTone;
      /** Set on the tiles that act as filter shortcuts. */
      readonly filter?: EnvelopeFilters;
    }>
  >(() => {
    const awaitingYou = allEnvelopes.filter((d) => isAwaitingYou(d, viewerEmail)).length;
    // Mutually exclusive with awaitingYou so the totals don't double-count.
    const awaitingOthers = allEnvelopes.filter(
      (d) =>
        (d.status === 'awaiting_others' || d.status === 'sealing') &&
        !isAwaitingYou(d, viewerEmail),
    ).length;
    const completedThisMonth = allEnvelopes.filter((d) => {
      if (d.status !== 'completed') return false;
      const when = new Date(d.completed_at ?? d.updated_at);
      const now = new Date();
      return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
    }).length;
    return [
      {
        label: 'Awaiting you',
        value: awaitingYou.toString(),
        tone: 'indigo',
        filter: STAT_FILTERS.awaitingYou,
      },
      {
        label: 'Awaiting others',
        value: awaitingOthers.toString(),
        tone: 'amber',
        filter: STAT_FILTERS.awaitingOthers,
      },
      {
        label: 'Sealed this month',
        value: completedThisMonth.toString(),
        tone: 'emerald',
        filter: STAT_FILTERS.sealedThisMonth,
      },
      { label: 'Avg. turnaround', value: formatTurnaround(allEnvelopes), tone: 'neutral' },
    ];
  }, [allEnvelopes, viewerEmail]);

  return (
    <Main>
      <Inner>
        <HeaderSlot>
          <PageHeader
            eyebrow="Documents"
            title="Everything you've sent"
            actions={
              <Button
                variant="primary"
                iconLeft={UploadCloud}
                onClick={() => navigate('/document/new')}
              >
                New document
              </Button>
            }
          />
        </HeaderSlot>

        <StatGrid>
          {stats.map((s) => {
            if (!s.filter) {
              return <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />;
            }
            const target = s.filter;
            const active = serializeFilters(parsedFilters) === serializeFilters(target);
            return (
              <StatCard
                key={s.label}
                label={s.label}
                value={s.value}
                tone={s.tone}
                active={active}
                onActivate={() => applyStatFilter(active ? EMPTY_FILTERS : target)}
              />
            );
          })}
        </StatGrid>

        <FilterToolbar envelopes={allEnvelopes} viewerEmail={viewerEmail} />

        <TableShell>
          <TableHead role="row" $grid={gridTemplate}>
            {COLUMN_KEYS.map((key) => {
              const sortKey = COLUMN_SORT_KEY[key];
              const active = sort.key === sortKey;
              return (
                <HeadCell
                  key={key}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  <SortHeaderButton
                    type="button"
                    $active={active}
                    onClick={() => handleSortClick(sortKey)}
                  >
                    {COLUMN_LABELS[key]}
                    {active ? (
                      <SortCaret aria-hidden>{sort.dir === 'asc' ? '▲' : '▼'}</SortCaret>
                    ) : null}
                  </SortHeaderButton>
                  <ColumnResizeHandle
                    width={widths[key] ?? DEFAULT_COLUMN_WIDTHS[key]}
                    onResize={(px) => setWidth(key, px)}
                    ariaLabel={`Resize ${COLUMN_LABELS[key]} column`}
                  />
                </HeadCell>
              );
            })}
            <div aria-hidden />
          </TableHead>
          {renderDocumentsBody({
            loading: documentsLoading,
            rowsForSkeleton: filtered.length === 0,
            filtered,
            navigate,
            viewerEmail,
            gridTemplate,
          })}
        </TableShell>
      </Inner>
    </Main>
  );
}
