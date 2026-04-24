import { useCallback, useMemo } from 'react';
import { UploadCloud } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '../../components/Badge';
import type { BadgeTone } from '../../components/Badge/Badge.types';
import { Button } from '../../components/Button';
import { DocThumb } from '../../components/DocThumb';
import { EmptyState } from '../../components/EmptyState';
import { FilterTabs } from '../../components/FilterTabs';
import { PageHeader } from '../../components/PageHeader';
import { Skeleton } from '../../components/Skeleton';
import { StatCard } from '../../components/StatCard';
import { useEnvelopesQuery } from '../../features/envelopes';
import type { EnvelopeListItem, EnvelopeStatus } from '../../features/envelopes';
import {
  DateCell,
  DocCell,
  DocCode,
  DocTitle,
  HeaderSlot,
  Inner,
  Main,
  RecipientCell,
  RecipientLabel,
  StatGrid,
  TableHead,
  TableRow,
  TableShell,
} from './DashboardPage.styles';

type FilterId = 'all' | 'you' | 'others' | 'completed' | 'drafts';

const FILTER_IDS: ReadonlyArray<FilterId> = ['all', 'you', 'others', 'completed', 'drafts'];

function isFilterId(value: string | null): value is FilterId {
  return value !== null && (FILTER_IDS as ReadonlyArray<string>).includes(value);
}

interface FilterDef {
  readonly id: FilterId;
  readonly label: string;
  readonly matches: (d: EnvelopeListItem) => boolean;
}

/**
 * Backend emits `draft | awaiting_others | sealing | completed | declined |
 * expired | canceled`. For the sender-facing dashboard we collapse this into
 * the five-tab taxonomy the UI was designed around. "Awaiting you" stays
 * visible but never matches (until co-signing ships).
 */
const FILTERS: ReadonlyArray<FilterDef> = [
  { id: 'all', label: 'All', matches: () => true },
  { id: 'you', label: 'Awaiting you', matches: () => false },
  {
    id: 'others',
    label: 'Awaiting others',
    matches: (d) => d.status === 'awaiting_others' || d.status === 'sealing',
  },
  { id: 'completed', label: 'Completed', matches: (d) => d.status === 'completed' },
  { id: 'drafts', label: 'Drafts', matches: (d) => d.status === 'draft' },
];

const STATUS_LABEL: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  awaiting_others: 'Awaiting others',
  sealing: 'Sealing',
  completed: 'Completed',
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

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

interface RenderDocumentsBodyArgs {
  readonly loading: boolean;
  readonly rowsForSkeleton: boolean;
  readonly filtered: ReadonlyArray<EnvelopeListItem>;
  readonly navigate: (path: string) => void;
}

function renderDocumentsBody(args: RenderDocumentsBodyArgs): JSX.Element | JSX.Element[] {
  const { loading, rowsForSkeleton, filtered, navigate } = args;
  if (loading && rowsForSkeleton) {
    return Array.from({ length: 6 }, (_, i) => (
      <TableRow key={`sk-${i}`} as="div" aria-hidden>
        <DocCell>
          <Skeleton variant="rect" width={40} height={40} />
          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <Skeleton width={200} />
            <Skeleton width={80} />
          </div>
        </DocCell>
        <RecipientCell>
          <Skeleton variant="circle" width={24} height={24} />
          <Skeleton width={120} />
        </RecipientCell>
        <Skeleton variant="rect" width={110} height={22} />
        <DateCell>
          <Skeleton width={90} />
        </DateCell>
        <Skeleton variant="rect" width={24} height={24} />
      </TableRow>
    ));
  }
  if (filtered.length === 0) {
    return <EmptyState>No documents match this filter.</EmptyState>;
  }
  return filtered.map((d) => (
    <TableRow
      key={d.id}
      type="button"
      onClick={() => navigate(`/document/${d.id}`)}
      aria-label={`Open ${d.title}`}
    >
      <DocCell>
        <DocThumb size={40} title={d.title} signed={d.status === 'completed'} />
        <div style={{ minWidth: 0 }}>
          <DocTitle>{d.title}</DocTitle>
          <DocCode>{d.short_code}</DocCode>
        </div>
      </DocCell>
      <RecipientCell>
        <RecipientLabel>—</RecipientLabel>
      </RecipientCell>
      <div>
        <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
      </div>
      <DateCell>{formatDate(d.updated_at)}</DateCell>
      <div aria-hidden />
    </TableRow>
  ));
}

/**
 * L4 page — the sender dashboard / inbox view listing every envelope the
 * user has created. Pulls from the live `/envelopes` endpoint via
 * React-Query; no hardcoded seed data.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawFilter = searchParams.get('filter');
  const tab: FilterId = isFilterId(rawFilter) ? rawFilter : 'all';

  const q = useEnvelopesQuery(true, { limit: 100 });
  const envelopes: ReadonlyArray<EnvelopeListItem> = useMemo(() => q.data?.items ?? [], [q.data]);
  const documentsLoading = q.isPending;

  const handleSelectTab = useCallback(
    (id: FilterId): void => {
      if (id === 'all') {
        setSearchParams({});
      } else {
        setSearchParams({ filter: id });
      }
    },
    [setSearchParams],
  );

  const counts = useMemo(() => {
    const byFilter = new Map<FilterId, number>();
    FILTERS.forEach((f) => {
      byFilter.set(f.id, envelopes.filter(f.matches).length);
    });
    return byFilter;
  }, [envelopes]);

  const filtered = useMemo(() => {
    const match = FILTERS.find((f) => f.id === tab) ?? FILTERS[0]!;
    return envelopes.filter(match.matches);
  }, [envelopes, tab]);

  const stats = useMemo(() => {
    const awaitingOthers = envelopes.filter(
      (d) => d.status === 'awaiting_others' || d.status === 'sealing',
    ).length;
    const completedThisMonth = envelopes.filter((d) => {
      if (d.status !== 'completed') return false;
      const when = new Date(d.completed_at ?? d.updated_at);
      const now = new Date();
      return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
    }).length;
    const drafts = envelopes.filter((d) => d.status === 'draft').length;
    return [
      { label: 'Drafts', value: drafts.toString(), tone: 'indigo' as const },
      { label: 'Awaiting others', value: awaitingOthers.toString(), tone: 'amber' as const },
      {
        label: 'Completed this month',
        value: completedThisMonth.toString(),
        tone: 'emerald' as const,
      },
      { label: 'Total', value: envelopes.length.toString(), tone: 'neutral' as const },
    ];
  }, [envelopes]);

  const tabItems = useMemo(
    () => FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts.get(f.id) ?? 0 })),
    [counts],
  );

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
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />
          ))}
        </StatGrid>

        <FilterTabs
          items={tabItems}
          activeId={tab}
          onSelect={(id) => handleSelectTab(id as FilterId)}
          aria-label="Document filters"
        />

        <TableShell>
          <TableHead role="row">
            <div>Document</div>
            <div>Recipient</div>
            <div>Status</div>
            <div>Date</div>
            <div aria-hidden />
          </TableHead>
          {renderDocumentsBody({
            loading: documentsLoading,
            rowsForSkeleton: envelopes.length === 0,
            filtered,
            navigate,
          })}
        </TableShell>
      </Inner>
    </Main>
  );
}
