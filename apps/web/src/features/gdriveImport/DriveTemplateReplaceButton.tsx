import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Compact "Pick from Google Drive" button for the Use Template wizard's
 * Step 1 (Document) replace-with row. Sits next to the existing
 * "Upload a PDF" button and inherits the same `secondary` variant so
 * the two affordances read as peers.
 *
 * When no Drive account is connected the button label flips to
 * "Connect Google Drive" and `onConnect` fires — which the caller wires
 * to `useConnectGDrive().mutate()` so the OAuth popup opens within the
 * user gesture (modern browsers block popups from non-gesture context).
 * Pre-2026-05-04 this navigated to `/settings/integrations`, breaking
 * flow continuity. The popup-bridge work (BroadcastChannel + AppShell-
 * mounted message listener) lets the consent flow complete inline and
 * flips the accounts query to "connected" so the button auto-updates.
 */
export interface DriveTemplateReplaceButtonProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
  /**
   * Called when the user clicks the disconnected-state CTA. Wire to
   * `useConnectGDrive().mutate()` at the call site so the OAuth popup
   * opens within the user gesture.
   */
  readonly onConnect: () => void;
}

export function DriveTemplateReplaceButton({
  connected,
  onPickDrive,
  onConnect,
}: DriveTemplateReplaceButtonProps) {
  return (
    <Button variant="secondary" onClick={connected ? onPickDrive : onConnect}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <GDriveLogo size={16} />
        {connected ? 'Pick from Google Drive' : 'Connect Google Drive'}
      </span>
    </Button>
  );
}
