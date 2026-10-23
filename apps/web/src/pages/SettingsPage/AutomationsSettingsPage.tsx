import { useParams } from 'react-router-dom';
import {
  AutomationDetail,
  AutomationsPanel,
  NewAutomationPanel,
  NotAvailable,
  isAutomationsEnabled,
} from '@/features/automations';
import { SettingsFrame, type SettingsVariant } from './SettingsFrame';

export interface AutomationsSettingsPageProps {
  readonly variant: SettingsVariant;
}

function paths(variant: SettingsVariant) {
  const mobile = variant === 'mobile';
  return {
    settings: mobile ? '/m/settings' : '/settings',
    list: mobile ? '/m/settings/automations' : '/settings/automations',
    integrations: mobile ? '/m/send/settings' : '/settings/integrations',
  };
}

/**
 * `/settings/automations` (desktop) and `/m/settings/automations` (phone):
 * the gallery and the list. With `workflowAutomations` off it renders the
 * not-available state and makes no API call.
 */
export function AutomationsSettingsPage({ variant }: AutomationsSettingsPageProps) {
  const p = paths(variant);
  return (
    <SettingsFrame variant={variant} title="Automations" backTo={p.settings}>
      {isAutomationsEnabled() ? <AutomationsPanel basePath={p.list} /> : <NotAvailable />}
    </SettingsFrame>
  );
}

/** `/settings/automations/new?recipe=<id>`. */
export function NewAutomationSettingsPage({ variant }: AutomationsSettingsPageProps) {
  const p = paths(variant);
  return (
    <SettingsFrame variant={variant} title="New automation" backTo={p.list}>
      {isAutomationsEnabled() ? <NewAutomationPanel basePath={p.list} /> : <NotAvailable />}
    </SettingsFrame>
  );
}

/** `/settings/automations/:id`: one automation with its run history. */
export function AutomationDetailSettingsPage({ variant }: AutomationsSettingsPageProps) {
  const p = paths(variant);
  const { id = '' } = useParams();
  return (
    <SettingsFrame variant={variant} title="Automation" backTo={p.list}>
      {isAutomationsEnabled() ? (
        <AutomationDetail id={id} listPath={p.list} integrationsPath={p.integrations} />
      ) : (
        <NotAvailable />
      )}
    </SettingsFrame>
  );
}
