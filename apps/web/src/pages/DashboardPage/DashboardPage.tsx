import { useMemo } from 'react';
import type { JSX } from 'react';
import { ChevronRight, UploadCloud } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/Badge';
import type { BadgeTone } from '@/components/Badge/Badge.types';
import { Button } from '@/components/Button';
import { DocThumb } from '@/components/DocThumb';
import { EmptyState } from '@/components/EmptyState';
import { EnvelopeIllustration } from '@/components/EnvelopeIllustration';
import { TagChip } from '@/components/TagChip';
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
import { filterEnvelopes, isAwaitingYou, parseFilters } from '@/features/dashboardFilters';
import { formatShortDate } from '@/lib/dateFormat';
import { useAuth } from '@/providers/AuthProvider';
import {
  ChevronCell,
  DateCell,
  DocCell,
  DocCode,
  DocTitle,
  HeaderSlot,
  Inner,
  Main,
  ProgressCell,
  SignersCell,
  StatGrid,
  TableHead,
  TableRow,
  TableShell,
} from './DashboardPage.styles';

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
}

function renderDocumentsBody(args: RenderDocumentsBodyArgs): JSX.Element | JSX.Element[] {
  const { loading, rowsForSkeleton, filtered, navigate, viewerEmail } = args;
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
  const [searchParams] = useSearchParams();

  const q = useEnvelopesQuery(true, { limit: 100 });
  const envelopes: ReadonlyArray<EnvelopeListItem> = useMemo(() => q.data?.items ?? [], [q.data]);
  const documentsLoading = q.isPending;

  // Viewer email drives the "Awaiting you" predicate so envelopes the user
  // is themselves a signer on are bucketed correctly.
  const { user } = useAuth();
  const viewerEmail = user?.email ?? null;

  // The new toolbar owns filter UI and writes to the URL; the page
  // reads the URL and applies a single combined filter pass. Keeps
  // the toolbar pluggable (piece #2 will add a tag chip) without
  // pushing per-filter state into the page.
  const parsedFilters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const filtered = useMemo(
    () => filterEnvelopes(envelopes, parsedFilters, viewerEmail),
    [envelopes, parsedFilters, viewerEmail],
  );

  const stats = useMemo(() => {
    const awaitingYou = envelopes.filter((d) => isAwaitingYou(d, viewerEmail)).length;
    // Mutually exclusive with awaitingYou so the totals don't double-count.
    const awaitingOthers = envelopes.filter(
      (d) =>
        (d.status === 'awaiting_others' || d.status === 'sealing') &&
        !isAwaitingYou(d, viewerEmail),
    ).length;
    const completedThisMonth = envelopes.filter((d) => {
      if (d.status !== 'completed') return false;
      const when = new Date(d.completed_at ?? d.updated_at);
      const now = new Date();
      return when.getFullYear() === now.getFullYear() && when.getMonth() === now.getMonth();
    }).length;
    return [
      { label: 'Awaiting you', value: awaitingYou.toString(), tone: 'indigo' as const },
      { label: 'Awaiting others', value: awaitingOthers.toString(), tone: 'amber' as const },
      {
        label: 'Sealed this month',
        value: completedThisMonth.toString(),
        tone: 'emerald' as const,
      },
      { label: 'Avg. turnaround', value: formatTurnaround(envelopes), tone: 'neutral' as const },
    ];
  }, [envelopes, viewerEmail]);

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

        <FilterToolbar envelopes={envelopes} viewerEmail={viewerEmail} />

        <TableShell>
          <TableHead role="row">
            <div>Document</div>
            <div>Signers</div>
            <div>Progress</div>
            <div>Status</div>
            <div>Date</div>
            <div aria-hidden />
          </TableHead>
          {renderDocumentsBody({
            loading: documentsLoading,
            rowsForSkeleton: envelopes.length === 0,
            filtered,
            navigate,
            viewerEmail,
          })}
        </TableShell>
      </Inner>
    </Main>
  );
}
