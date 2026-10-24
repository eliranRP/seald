import type { HTMLAttributes } from 'react';
import type { OnlinePhase } from '@/lib/system/useOnlineStatus';

export interface OfflineBarProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Force a phase (stories, previews). Omit to follow the browser:
   * `navigator.onLine`, the online/offline events and the API health ping.
   */
  readonly phase?: OnlinePhase | undefined;
}
