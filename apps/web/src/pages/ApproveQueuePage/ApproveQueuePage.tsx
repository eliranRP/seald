import { ApprovalsNotFound } from '@/features/approvals/ApprovalsNotFound';
import { ApprovalsQueue } from '@/features/approvals/ApprovalsQueue';
import { isApprovalsEnabled } from '@/features/approvals/model';
import { useDocumentTitle } from '@/features/approvals/useDocumentTitle';
import { SettingsFrame, type SettingsVariant } from '@/pages/SettingsPage/SettingsFrame';

export interface ApproveQueuePageProps {
  readonly variant: SettingsVariant;
}

/**
 * `/settings/approvals` (desktop, inside `AppShell`) and
 * `/m/settings/approvals` (phone): the same queue in the two settings
 * frames. Flag off renders the not-found page and makes no API call.
 */
export function ApproveQueuePage({ variant }: ApproveQueuePageProps) {
  useDocumentTitle('Approvals');
  if (!isApprovalsEnabled()) return <ApprovalsNotFound />;
  return (
    <SettingsFrame
      variant={variant}
      title="Approvals"
      backTo={variant === 'mobile' ? '/m/settings' : '/settings'}
    >
      <ApprovalsQueue />
    </SettingsFrame>
  );
}
