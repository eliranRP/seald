const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "12m ago", "2h ago", "5d ago", "2w ago", "1mo ago", "3mo ago",
 * "2y ago": the short past-time label on Templates ("Used 12× · 3d ago") and
 * Contacts ("Last sent"). Empty string for a missing or unparseable time.
 */
export function relativeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (iso === null || iso === undefined) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Math.max(0, now.getTime() - then);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${String(Math.floor(diff / MINUTE))}m ago`;
  if (diff < DAY) return `${String(Math.floor(diff / HOUR))}h ago`;
  const days = Math.floor(diff / DAY);
  if (days < 7) return `${String(days)}d ago`;
  if (days < 30) return `${String(Math.floor(days / 7))}w ago`;
  if (days < 365) return `${String(Math.floor(days / 30))}mo ago`;
  return `${String(Math.floor(days / 365))}y ago`;
}
