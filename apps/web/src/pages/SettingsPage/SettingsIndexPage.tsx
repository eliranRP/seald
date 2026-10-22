import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import { isDevelopersEnabled } from '@/features/developers';
import { SettingsFrame, type SettingsVariant } from './SettingsFrame';

const List = styled.ul`
  list-style: none;
  margin: 0;
  padding: 0;
  max-width: 720px;
  margin-inline: auto;
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.paper};
  overflow: hidden;
`;

const Row = styled.li`
  & + & {
    border-top: 1px solid ${({ theme }) => theme.color.border[1]};
  }
`;

const RowLink = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 56px;
  padding: 0 ${({ theme }) => theme.space[4]};
  color: ${({ theme }) => theme.color.fg[1]};
  font-size: ${({ theme }) => theme.font.size.body};
  text-decoration: none;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: -2px;
  }
`;

const Empty = styled.p`
  max-width: 720px;
  margin-inline: auto;
  color: ${({ theme }) => theme.color.fg[3]};
`;

export interface SettingsIndexPageProps {
  readonly variant: SettingsVariant;
}

/**
 * `/settings` (desktop, inside `AppShell`) and `/m/settings` (phone). A row
 * appears only when its feature's flag is on. Drive stays at
 * `/m/send/settings` on a phone.
 */
export function SettingsIndexPage({ variant }: SettingsIndexPageProps) {
  const mobile = variant === 'mobile';
  const rows: Array<{ readonly label: string; readonly to: string }> = [];
  if (isFeatureEnabled('gdriveIntegration')) {
    rows.push({
      label: 'Integrations',
      to: mobile ? '/m/send/settings' : '/settings/integrations',
    });
  }
  if (isDevelopersEnabled()) {
    rows.push({
      label: 'Developers',
      to: mobile ? '/m/settings/developers' : '/settings/developers',
    });
  }
  return (
    <SettingsFrame variant={variant} title="Settings" backTo={mobile ? '/m/send' : undefined}>
      {rows.length > 0 ? (
        <List aria-label="Settings">
          {rows.map((row) => (
            <Row key={row.to}>
              <RowLink to={row.to}>
                {row.label}
                <ChevronRight size={18} aria-hidden />
              </RowLink>
            </Row>
          ))}
        </List>
      ) : (
        <Empty>Nothing to set up yet.</Empty>
      )}
    </SettingsFrame>
  );
}
