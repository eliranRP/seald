import { DevelopersPanel, isDevelopersEnabled, NotAvailable } from '@/features/developers';
import { SettingsFrame, type SettingsVariant } from './SettingsFrame';

export interface DevelopersSettingsPageProps {
  readonly variant: SettingsVariant;
}

/**
 * `/settings/developers` (desktop) and `/m/settings/developers` (phone): the
 * same panel in two frames. With both `mcpServer` and `publicApi` off it
 * renders the not-available state and makes no API call.
 */
export function DevelopersSettingsPage({ variant }: DevelopersSettingsPageProps) {
  return (
    <SettingsFrame
      variant={variant}
      title="Developers"
      backTo={variant === 'mobile' ? '/m/settings' : '/settings'}
    >
      {isDevelopersEnabled() ? <DevelopersPanel /> : <NotAvailable />}
    </SettingsFrame>
  );
}
