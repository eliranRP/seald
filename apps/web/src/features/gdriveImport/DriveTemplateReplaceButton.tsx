import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Compact "Pick from Google Drive" button for the Use Template wizard's
 * Step 1 (Document) replace-with row. Sits next to the existing
 * "Upload a PDF" button and inherits the same `secondary` variant so
 * the two affordances read as peers.
 *
 * When no Drive account is connected the button is replaced with a
 * "Connect Drive in Settings" CTA that navigates to
 * `/settings/integrations`. Same accessibility contract + rationale as
 * `DriveSourceCard` (see that component's header comment + the Gherkin
 * spec at `apps/web/e2e/features/gdrive/disabled-cta.feature`).
 */
export interface DriveTemplateReplaceButtonProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
}

const SETTINGS_INTEGRATIONS_PATH = '/settings/integrations';

export function DriveTemplateReplaceButton({
  connected,
  onPickDrive,
}: DriveTemplateReplaceButtonProps) {
  const navigate = useNavigate();
  return (
    <Button
      variant="secondary"
      onClick={connected ? onPickDrive : () => navigate(SETTINGS_INTEGRATIONS_PATH)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <GDriveLogo size={16} />
        {connected ? 'Pick from Google Drive' : 'Connect Drive in Settings'}
      </span>
    </Button>
  );
}
