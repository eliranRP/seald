import { useEffect } from 'react';
import type { JSX, ReactNode } from 'react';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { pingHealth } from '@/lib/system/useOnlineStatus';
import { setMaintenance, useSystemState } from '@/lib/system/systemStore';

/** How often the maintenance page asks the API whether it is back. */
export const MAINTENANCE_POLL_MS = 30_000;

/**
 * While the API reports maintenance every route renders the maintenance
 * page; the gate polls `/health` and lifts the page by itself when the API
 * answers again. Otherwise it renders the app untouched.
 */
export function MaintenanceGate({ children }: { readonly children: ReactNode }): JSX.Element {
  const { maintenance } = useSystemState();

  useEffect(() => {
    if (!maintenance.active) return undefined;
    const id = window.setInterval(() => {
      void pingHealth().then((ok) => {
        if (ok) setMaintenance(false);
      });
    }, MAINTENANCE_POLL_MS);
    return () => {
      window.clearInterval(id);
    };
  }, [maintenance.active]);

  if (maintenance.active) return <MaintenancePage etaMinutes={maintenance.etaMinutes} />;
  return <>{children}</>;
}
