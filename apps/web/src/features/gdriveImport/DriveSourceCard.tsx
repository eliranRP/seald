import styled from 'styled-components';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Full-width "From Google Drive" source card for the New Document flow.
 * Renders below the existing Upload + Template grid in `UploadRoute`.
 *
 * The card is feature-flag gated at the call site — when
 * `feature.gdriveIntegration` is OFF, the route does not render this
 * component at all. When it IS on but no account is connected, the
 * Pick CTA is replaced with an enabled "Connect Drive in Settings"
 * button that navigates to `/settings/integrations`. Pre-fix the CTA
 * was a `<button disabled title="…">` — the native `title` attribute
 * isn't announced by screen readers on a disabled button, the button
 * isn't focusable, and touch users get no tooltip at all (a dead-end
 * surface). See `DriveSourceCard.test.tsx` + the Gherkin spec at
 * `apps/web/e2e/features/gdrive/disabled-cta.feature`.
 */
export interface DriveSourceCardProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
}

const SETTINGS_INTEGRATIONS_PATH = '/settings/integrations';

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

export function DriveSourceCard({ connected, onPickDrive }: DriveSourceCardProps) {
  const navigate = useNavigate();
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
        <Button variant="secondary" onClick={() => navigate(SETTINGS_INTEGRATIONS_PATH)}>
          Connect Drive in Settings
        </Button>
      )}
    </Card>
  );
}
