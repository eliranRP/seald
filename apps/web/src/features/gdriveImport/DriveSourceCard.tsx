import styled from 'styled-components';
import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Full-width "From Google Drive" source card for the New Document flow.
 * Renders below the existing Upload + Template grid in `UploadRoute`.
 *
 * The card is feature-flag gated at the call site — when
 * `feature.gdriveIntegration` is OFF, the route does not render this
 * component at all. When it IS on but no account is connected, the
 * Pick CTA is replaced with an enabled "Connect Google Drive" button
 * that calls the caller-supplied `onConnect` (which opens the OAuth
 * popup inline — no full-page navigation away from the upload flow).
 *
 * Pre-2026-05-04 the disconnected CTA navigated to
 * `/settings/integrations`, breaking flow continuity (the user lost
 * their upload context). With the popup-bridge work (Bug F/G/H/I) the
 * consent flow can complete in a popup and signal the parent tab via
 * BroadcastChannel; AppShell mounts the listener so the accounts query
 * flips to "connected" inline and this card auto-updates to its
 * connected branch.
 */
export interface DriveSourceCardProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
  /**
   * Called when the user clicks the disconnected-state CTA. Wire to
   * `useConnectGDrive().mutate()` at the call site so the OAuth popup
   * opens within the user gesture — modern browsers block popups
   * opened from a non-gesture context.
   */
  readonly onConnect: () => void;
}

const Card = styled.div`
  background: ${({ theme }) => theme.color.bg.surface};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  padding: ${({ theme }) => theme.space[5]};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[4]};
  margin-top: ${({ theme }) => theme.space[5]};
`;

const IconBox = styled.div`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.subtle};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const Body = styled.div`
  flex: 1;
  min-width: 0;
`;

const Heading = styled.div`
  font-size: ${({ theme }) => theme.font.size.h5};
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const Description = styled.p`
  margin: 4px 0 0;
  font-size: ${({ theme }) => theme.font.size.bodySm};
  color: ${({ theme }) => theme.color.fg[3]};
  line-height: ${({ theme }) => theme.font.lineHeight.normal};
`;

export function DriveSourceCard({ connected, onPickDrive, onConnect }: DriveSourceCardProps) {
  return (
    <Card>
      <IconBox aria-hidden>
        <GDriveLogo size={26} />
      </IconBox>
      <Body>
        <Heading>From Google Drive</Heading>
        <Description>
          Pick a PDF, Google Doc, or Word document from your Drive. Per-file access only.
        </Description>
      </Body>
      {connected ? (
        <Button variant="primary" onClick={onPickDrive}>
          Pick from Google Drive
        </Button>
      ) : (
        <Button variant="secondary" onClick={onConnect}>
          Connect Google Drive
        </Button>
      )}
    </Card>
  );
}
