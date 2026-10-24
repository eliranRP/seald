import type { JSX } from 'react';
import { Clock, Settings } from 'lucide-react';
import { ButtonRoot } from '@/components/Button/Button.styles';
import { InfoChip } from '@/components/InfoChip';
import { OfflineBar } from '@/components/OfflineBar';
import { StatePage } from '@/components/StatePage';
import { PublicHeader } from '@/layout/PublicHeader';

export interface MaintenancePageProps {
  /** Minutes the API said maintenance would last; "About 15 min" when unknown. */
  readonly etaMinutes?: number | null | undefined;
}

const DEFAULT_ETA_MINUTES = 15;

/**
 * Full public page shown on every route while the API reports maintenance
 * (503 + `x-maintenance: 1`). No sign-in needed and no navigation: the gate
 * polls the health endpoint and lifts the page by itself when the API is
 * back. The status link only renders when `VITE_STATUS_PAGE_URL` is set.
 */
export function MaintenancePage({ etaMinutes }: MaintenancePageProps): JSX.Element {
  const minutes = etaMinutes ?? DEFAULT_ETA_MINUTES;
  const statusUrl = import.meta.env.VITE_STATUS_PAGE_URL;
  return (
    <>
      <OfflineBar />
      <PublicHeader />
      <StatePage icon={Settings} tone="neutral" title="Back soon">
        <InfoChip icon={Clock}>{`About ${String(minutes)} min`}</InfoChip>
        {statusUrl ? (
          // `.btn.btn-ghost` link (44px), as on the System maintenance board.
          <ButtonRoot
            as="a"
            $variant="ghost"
            $size="md"
            $fullWidth={false}
            $iconOnly={false}
            href={statusUrl}
            rel="noreferrer"
          >
            Status page
          </ButtonRoot>
        ) : null}
      </StatePage>
    </>
  );
}
