import type { EnvelopeListItem } from 'shared';
import { isAwaitingYou } from '@/features/dashboardFilters';

/**
 * Pure view model for the Documents home (`/documents`): which tab a
 * document belongs to, its row status, the "Needs you" cards, grouping by
 * recency, and the client-side search / date / people / tag filters. The
 * page fetches the full list once, so counts and tabs stay exact.
 */

export type DashboardTab = 'all' | 'you' | 'others' | 'sealed' | 'drafts' | 'stopped';
export const DASHBOARD_TABS: ReadonlyArray<DashboardTab> = [
  'all',
  'you',
  'others',
  'sealed',
  'drafts',
  'stopped',
];

/** Row status: the design's `badge-*` family plus `sealing`. */
export type RowStatus =
  | 'you'
  | 'others'
  | 'sealing'
  | 'sealed'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'draft';

export type DatePreset = 'any' | 'today' | '7d' | '30d' | 'month';
export const DATE_PRESETS: ReadonlyArray<DatePreset> = ['any', 'today', '7d', '30d', 'month'];

export type SortKey = 'recent' | 'oldest' | 'title';

export interface ViewFilters {
  readonly tab: DashboardTab;
  readonly query: string;
  readonly date: DatePreset;
  /** Lower-cased signer emails. */
  readonly people: ReadonlyArray<string>;
  /** Lower-cased tags. */
  readonly tags: ReadonlyArray<string>;
  readonly sort: SortKey;
}

export const EMPTY_VIEW: ViewFilters = {
  tab: 'all',
  query: '',
  date: 'any',
  people: [],
  tags: [],
  sort: 'recent',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function rowStatus(env: EnvelopeListItem, viewerEmail: string | null): RowStatus {
  switch (env.status) {
    case 'draft':
      return 'draft';
    case 'completed':
      return 'sealed';
    case 'declined':
      return 'declined';
    case 'expired':
      return 'expired';
    case 'canceled':
      return 'canceled';
    case 'sealing':
      return isAwaitingYou(env, viewerEmail) ? 'you' : 'sealing';
    case 'awaiting_others':
      return isAwaitingYou(env, viewerEmail) ? 'you' : 'others';
  }
}

export function tabOf(status: RowStatus): Exclude<DashboardTab, 'all'> {
  switch (status) {
    case 'you':
      return 'you';
    case 'others':
    case 'sealing':
      return 'others';
    case 'sealed':
      return 'sealed';
    case 'draft':
      return 'drafts';
    case 'declined':
    case 'expired':
    case 'canceled':
      return 'stopped';
  }
}

export function tabCounts(
  items: ReadonlyArray<EnvelopeListItem>,
  viewerEmail: string | null,
): Record<DashboardTab, number> {
  const counts: Record<DashboardTab, number> = {
    all: items.length,
    you: 0,
    others: 0,
    sealed: 0,
    drafts: 0,
    stopped: 0,
  };
  for (const env of items) counts[tabOf(rowStatus(env, viewerEmail))] += 1;
  return counts;
}

function dateWindowStart(preset: DatePreset, now: Date): number | null {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (preset) {
    case 'any':
      return null;
    case 'today':
      return startOfToday;
    case '7d':
      return now.getTime() - 7 * DAY_MS;
    case '30d':
      return now.getTime() - 30 * DAY_MS;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
}

/** Everything except the tab: search, date, people and tags. */
export function matchesFilters(
  env: EnvelopeListItem,
  filters: Omit<ViewFilters, 'tab' | 'sort'>,
  now: Date,
): boolean {
  const q = filters.query.trim().toLowerCase();
  if (q !== '') {
    const hay = `${env.title} ${env.short_code}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  const from = dateWindowStart(filters.date, now);
  if (from !== null && new Date(env.updated_at).getTime() < from) return false;
  if (filters.people.length > 0) {
    const emails = new Set(env.signers.map((s) => s.email.toLowerCase()));
    if (!filters.people.some((p) => emails.has(p))) return false;
  }
  if (filters.tags.length > 0) {
    const tags = new Set((env.tags ?? []).map((t) => t.toLowerCase()));
    if (!filters.tags.some((t) => tags.has(t))) return false;
  }
  return true;
}

export function sortItems(
  items: ReadonlyArray<EnvelopeListItem>,
  sort: SortKey,
): EnvelopeListItem[] {
  const copy = [...items];
  const time = (e: EnvelopeListItem): number => new Date(e.updated_at).getTime();
  if (sort === 'title') copy.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === 'oldest') copy.sort((a, b) => time(a) - time(b));
  else copy.sort((a, b) => time(b) - time(a));
  return copy;
}

export function applyView(
  items: ReadonlyArray<EnvelopeListItem>,
  filters: ViewFilters,
  viewerEmail: string | null,
  now: Date,
): EnvelopeListItem[] {
  const kept = items.filter(
    (env) =>
      (filters.tab === 'all' || tabOf(rowStatus(env, viewerEmail)) === filters.tab) &&
      matchesFilters(env, filters, now),
  );
  return sortItems(kept, filters.sort);
}

export function hasActiveFilters(filters: ViewFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.date !== 'any' ||
    filters.people.length > 0 ||
    filters.tags.length > 0
  );
}

export type GroupKey = 'today' | 'week' | 'earlier';
export const GROUP_LABEL: Record<GroupKey, string> = {
  today: 'Today',
  week: 'This week',
  earlier: 'Earlier',
};

export interface DocGroup {
  readonly key: GroupKey;
  readonly label: string;
  readonly items: ReadonlyArray<EnvelopeListItem>;
}

/** Today / This week (last 7 days) / Earlier. Empty groups are dropped. */
export function groupByRecency(items: ReadonlyArray<EnvelopeListItem>, now: Date): DocGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = startOfToday - 7 * DAY_MS;
  const buckets: Record<GroupKey, EnvelopeListItem[]> = { today: [], week: [], earlier: [] };
  for (const env of items) {
    const t = new Date(env.updated_at).getTime();
    if (t >= startOfToday) buckets.today.push(env);
    else if (t >= weekStart) buckets.week.push(env);
    else buckets.earlier.push(env);
  }
  return (['today', 'week', 'earlier'] as const)
    .filter((key) => buckets[key].length > 0)
    .map((key) => ({ key, label: GROUP_LABEL[key], items: buckets[key] }));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function shortDate(iso: string | null, now: Date): string {
  if (iso === null) return '';
  const d = new Date(iso);
  const base = `${MONTHS[d.getMonth()] ?? ''} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** "Updated" column: today → time, this week → weekday, else "Apr 14". */
export function formatUpdated(iso: string, now: Date): string {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= startOfToday) {
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'now';
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (d.getTime() >= startOfToday - 6 * DAY_MS) return WEEKDAYS[d.getDay()] ?? '';
  return shortDate(iso, now);
}

/** Compact age for the Needs-you cards: "now", "5m", "2h", "5d". */
export function formatAge(iso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

type Signer = EnvelopeListItem['signers'][number];

export function isViewerSigner(signer: Signer, viewerEmail: string | null): boolean {
  return viewerEmail !== null && signer.email.toLowerCase() === viewerEmail.toLowerCase();
}

/** One short word for what is going on: "Hannah", "Tom +1", "Carmen". */
export function statusReason(
  env: EnvelopeListItem,
  status: RowStatus,
  viewerEmail: string | null,
  now: Date,
): string {
  switch (status) {
    case 'you':
      return 'Your turn';
    case 'others':
    case 'sealing': {
      const pending = env.signers.filter(
        (s) =>
          s.status !== 'completed' && s.status !== 'declined' && !isViewerSigner(s, viewerEmail),
      );
      const first = pending[0];
      if (first === undefined) return status === 'sealing' ? 'Sealing' : 'Waiting';
      return pending.length > 1
        ? `${firstName(first.name)} +${pending.length - 1}`
        : firstName(first.name);
    }
    case 'declined': {
      const who = env.signers.find((s) => s.status === 'declined');
      return who ? firstName(who.name) : 'Declined';
    }
    case 'sealed':
      return shortDate(env.completed_at ?? env.updated_at, now);
    case 'expired':
    case 'canceled':
      return shortDate(env.updated_at, now);
    case 'draft':
      return 'Not sent';
  }
}

export type NeedsKind = 'bounced' | 'you' | 'others' | 'declined';

export interface NeedsCard {
  readonly id: string;
  readonly kind: NeedsKind;
  readonly envelope: EnvelopeListItem;
  readonly reason: string;
  readonly age: string;
  /** Bounced cards only: the signer whose address failed. */
  readonly signer?: Signer;
}

/** Signer status the mail provider reported as bounced (set by the email workstream). */
export function isBouncedSigner(signer: Signer): boolean {
  return (signer.status as string) === 'bounced';
}

const STALE_WAITING_DAYS = 3;

/**
 * Cards for the "Needs you" strip, most urgent first: bounced mail, then
 * documents waiting on the viewer, then declined documents, then documents
 * that have waited on someone else for a while. The caller shows at most 3
 * and a "+N" link for the rest.
 */
export function needsYouCards(
  items: ReadonlyArray<EnvelopeListItem>,
  viewerEmail: string | null,
  now: Date,
): NeedsCard[] {
  const bounced: NeedsCard[] = [];
  const you: NeedsCard[] = [];
  const declined: NeedsCard[] = [];
  const stale: NeedsCard[] = [];
  const byRecent = sortItems(items, 'recent');
  for (const env of byRecent) {
    const status = rowStatus(env, viewerEmail);
    const age = formatAge(env.sent_at ?? env.updated_at, now);
    const badSigner =
      env.status === 'awaiting_others' ? env.signers.find(isBouncedSigner) : undefined;
    if (badSigner !== undefined) {
      bounced.push({
        id: `bounced:${env.id}`,
        kind: 'bounced',
        envelope: env,
        reason: badSigner.email,
        age,
        signer: badSigner,
      });
    } else if (status === 'you') {
      you.push({ id: env.id, kind: 'you', envelope: env, reason: 'Your turn', age });
    } else if (status === 'declined') {
      declined.push({
        id: env.id,
        kind: 'declined',
        envelope: env,
        reason: statusReason(env, status, viewerEmail, now),
        age: formatAge(env.updated_at, now),
      });
    } else if (status === 'others') {
      const sentAt = new Date(env.sent_at ?? env.updated_at).getTime();
      if (now.getTime() - sentAt >= STALE_WAITING_DAYS * DAY_MS) {
        stale.push({
          id: env.id,
          kind: 'others',
          envelope: env,
          reason: statusReason(env, status, viewerEmail, now),
          age,
        });
      }
    }
  }
  return [...bounced, ...you, ...declined, ...stale];
}

export interface PersonOption {
  readonly email: string;
  readonly name: string;
}

export function uniquePeople(items: ReadonlyArray<EnvelopeListItem>): PersonOption[] {
  const map = new Map<string, PersonOption>();
  for (const env of items) {
    for (const s of env.signers) {
      const key = s.email.toLowerCase();
      if (!map.has(key)) map.set(key, { email: key, name: s.name });
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function uniqueTags(items: ReadonlyArray<EnvelopeListItem>): string[] {
  const set = new Set<string>();
  for (const env of items) for (const t of env.tags ?? []) set.add(t.toLowerCase());
  return [...set].sort();
}

/**
 * Median turnaround from send to seal across completed documents, as
 * "1.4d" / "14h". `null` when nothing has completed yet.
 */
export function formatTurnaround(items: ReadonlyArray<EnvelopeListItem>): string | null {
  const hours: number[] = [];
  for (const d of items) {
    if (d.status === 'completed' && d.sent_at && d.completed_at) {
      const span = new Date(d.completed_at).getTime() - new Date(d.sent_at).getTime();
      if (Number.isFinite(span) && span > 0) hours.push(span / 3_600_000);
    }
  }
  if (hours.length === 0) return null;
  hours.sort((a, b) => a - b);
  const mid = Math.floor(hours.length / 2);
  const median =
    hours.length % 2 === 0 ? ((hours[mid - 1] ?? 0) + (hours[mid] ?? 0)) / 2 : (hours[mid] ?? 0);
  return median >= 24 ? `${(median / 24).toFixed(1)}d` : `${Math.max(1, Math.round(median))}h`;
}
