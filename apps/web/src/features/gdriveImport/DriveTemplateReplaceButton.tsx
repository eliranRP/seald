import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Compact "Pick from Google Drive" button for the Use Template wizard's
 * Step 1 (Document) replace-with row. Sits next to the existing
 * "Upload a PDF" button and inherits the same `secondary` variant so
 * the two affordances read as peers.
 *
 * Disabled-with-tooltip when no Drive account is connected — same
 * contract as `DriveSourceCard` on the New Document surface.
 */
export interface DriveTemplateReplaceButtonProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
}

const DISABLED_TOOLTIP = 'Connect Google Drive in Settings to use this.';

export function DriveTemplateReplaceButton({
  connected,
  onPickDrive,
}: DriveTemplateReplaceButtonProps) {
  return (
    <Button
      variant="secondary"
      onClick={onPickDrive}
      disabled={!connected}
      {...(connected ? {} : { title: DISABLED_TOOLTIP })}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <GDriveLogo size={16} />
        Pick from Google Drive
      </span>
    </Button>
  );
}
