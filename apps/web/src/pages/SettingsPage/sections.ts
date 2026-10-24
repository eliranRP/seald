import { Bell, Layers, Settings, Signature, User, type LucideIcon } from 'lucide-react';
import { isFeatureEnabled } from 'shared';
import { isApprovalsEnabled } from '@/features/approvals';
import { isAutomationsEnabled } from '@/features/automations';
import { isDevelopersEnabled } from '@/features/developers';

export type SettingsSectionId =
  'profile' | 'signature' | 'notifications' | 'integrations' | 'account';

export interface SettingsSectionDef {
  readonly id: SettingsSectionId;
  readonly label: string;
  readonly icon: LucideIcon;
}

const ALL_SECTIONS: ReadonlyArray<SettingsSectionDef> = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'signature', label: 'Signature', icon: Signature },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'integrations', label: 'Integrations', icon: Layers },
  { id: 'account', label: 'Account', icon: Settings },
];

/** The sections to show. Integrations is hidden when Drive is switched off. */
export function visibleSections(): ReadonlyArray<SettingsSectionDef> {
  return ALL_SECTIONS.filter(
    (s) => s.id !== 'integrations' || isFeatureEnabled('gdriveIntegration'),
  );
}

export function isSectionId(value: string | undefined): value is SettingsSectionId {
  return visibleSections().some((s) => s.id === value);
}

export interface FlaggedRow {
  readonly label: string;
  readonly to: string;
}

/**
 * Pages that exist only behind a feature flag. They keep their own routes
 * (desktop or `/m/settings/*` on a phone) and sit under the sections.
 */
export function flaggedRows(mobile: boolean): ReadonlyArray<FlaggedRow> {
  const base = mobile ? '/m/settings' : '/settings';
  const rows: FlaggedRow[] = [];
  if (isAutomationsEnabled()) rows.push({ label: 'Automations', to: `${base}/automations` });
  if (isDevelopersEnabled()) rows.push({ label: 'Developers', to: `${base}/developers` });
  if (isApprovalsEnabled()) rows.push({ label: 'Approvals', to: `${base}/approvals` });
  return rows;
}
