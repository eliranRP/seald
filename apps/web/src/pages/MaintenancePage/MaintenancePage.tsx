import type { JSX } from 'react';
import { Clock, Settings } from 'lucide-react';
import styled from 'styled-components';
import { InfoChip } from '@/components/InfoChip';
import { OfflineBar } from '@/components/OfflineBar';
import { StatePage } from '@/components/StatePage';
import { PublicHeader } from '@/layout/PublicHeader';

const StatusLink = styled.a`
  font-size: ${({ theme }) => theme.font.size.bodySm};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.indigo[700]};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

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
      <StatePage icon={Settings} tone="warn" title="Back soon">
        <InfoChip icon={Clock}>{`About ${String(minutes)} min`}</InfoChip>
        {statusUrl ? (
          <StatusLink href={statusUrl} rel="noreferrer">
            Status page
          </StatusLink>
        ) : null}
      </StatePage>
    </>
  );
}
