import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import { BackLink, Page, Title } from './developers/DevelopersKeysScreen.styles';

const List = styled.ul`
  list-style: none;
  margin: ${({ theme }) => `${theme.space[6]} 0 0`};
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.space[2]};
`;

const Row = styled(Link)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.space[3]};
  min-height: 44px;
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
  border: 1px solid ${({ theme }) => theme.color.border[1]};
  border-radius: ${({ theme }) => theme.radius.lg};
  background: ${({ theme }) => theme.color.bg.surface};
  color: ${({ theme }) => theme.color.fg[1]};
  text-decoration: none;
  font-size: ${({ theme }) => theme.font.size.body};
  font-weight: ${({ theme }) => theme.font.weight.medium};

  &:focus-visible {
    outline: none;
    box-shadow: ${({ theme }) => theme.shadow.focus};
  }
`;

const Note = styled.p`
  margin: ${({ theme }) => `${theme.space[4]} 0 0`};
  color: ${({ theme }) => theme.color.fg[3]};
  font-size: ${({ theme }) => theme.font.size.body};
`;

export function SettingsIndexView(props: {
  readonly phone: boolean;
  readonly showIntegrations: boolean;
}) {
  const { phone, showIntegrations } = props;
  return (
    <Page>
      {phone ? <BackLink to="/m/send">Back</BackLink> : null}
      <Title>Settings</Title>
      <List>
        {showIntegrations ? (
          <li>
            <Row to={phone ? '/m/send/settings' : '/settings/integrations'}>
              <span>Integrations</span>
              <ChevronRight aria-hidden size={18} />
            </Row>
          </li>
        ) : null}
        <li>
          <Row to={phone ? '/m/settings/developers' : '/settings/developers'}>
            <span>Developers</span>
            <ChevronRight aria-hidden size={18} />
          </Row>
        </li>
      </List>
    </Page>
  );
}

/**
 * Short settings index. A row appears only when that feature's flag is on.
 * Automations waits for its own flag. Direct visits with `mcpServer` off
 * show the not-available state.
 */
export function SettingsIndexPage() {
  const phone = useLocation().pathname.startsWith('/m/');
  const mcpOn = isFeatureEnabled('mcpServer');
  const driveOn = isFeatureEnabled('gdriveIntegration');

  if (!mcpOn) {
    return (
      <Page>
        {phone ? <BackLink to="/m/send">Back</BackLink> : null}
        <Title>Settings</Title>
        <Note>Not available.</Note>
      </Page>
    );
  }

  return <SettingsIndexView phone={phone} showIntegrations={driveOn} />;
}
