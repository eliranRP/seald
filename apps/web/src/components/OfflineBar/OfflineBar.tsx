import type { JSX } from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useOnlineStatus } from '@/lib/system/useOnlineStatus';
import { Icon } from '../Icon';
import { Spinner } from '../Spinner';
import type { OfflineBarProps } from './OfflineBar.types';
import { Bar } from './OfflineBar.styles';

const COPY = {
  offline: "You're offline · changes will sync",
  reconnecting: 'Reconnecting…',
  back: 'Back online',
} as const;

/**
 * L1 primitive — thin bar at the very top of the page (canvas
 * `.offline-bar`): dark "You're offline · changes will sync", a spinner while
 * the API health check is pending, and a green "Back online" for 2 s. It sits
 * in flow, so it pushes the page down instead of covering the nav. Renders
 * nothing while the connection is fine. `role="status"` (polite).
 */
export function OfflineBar({ phase: forced, ...rest }: OfflineBarProps): JSX.Element | null {
  const live = useOnlineStatus();
  const phase = forced ?? live.phase;
  if (phase === 'idle') return null;
  return (
    <Bar role="status" aria-live="polite" $ok={phase === 'back'} {...rest}>
      {phase === 'reconnecting' ? <Spinner size="md" /> : null}
      {phase === 'offline' ? <Icon icon={AlertCircle} size={14} /> : null}
      {phase === 'back' ? <Icon icon={CheckCircle2} size={14} /> : null}
      <span>{COPY[phase]}</span>
    </Bar>
  );
}
