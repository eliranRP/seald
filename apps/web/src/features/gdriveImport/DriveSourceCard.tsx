import styled from 'styled-components';
import { Button } from '@/components/Button';
import { GDriveLogo } from './GDriveLogo';

/**
 * Full-width "From Google Drive" source card for the New Document flow.
 * Renders below the existing Upload + Template grid in `UploadRoute`.
 *
 * The card is feature-flag gated at the call site — when
 * `feature.gdriveIntegration` is OFF, the route does not render this
 * component at all. When it IS on but no account is connected, the CTA
 * is disabled with a tooltip pointing the sender to Settings.
 */
export interface DriveSourceCardProps {
  readonly connected: boolean;
  readonly onPickDrive: () => void;
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

const DISABLED_TOOLTIP = 'Connect Google Drive in Settings to use this.';

export function DriveSourceCard({ connected, onPickDrive }: DriveSourceCardProps) {
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
      <Button
        variant={connected ? 'primary' : 'secondary'}
        onClick={onPickDrive}
        disabled={!connected}
        {...(connected ? {} : { title: DISABLED_TOOLTIP })}
      >
        Pick from Google Drive
      </Button>
    </Card>
  );
}
