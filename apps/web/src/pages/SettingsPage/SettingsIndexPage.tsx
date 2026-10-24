import { ChevronRight } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readIsMobileViewport } from '@/hooks/useIsMobileViewport';
import {
  Chevron,
  Grow,
  IndexIcon,
  IndexLink,
  IndexList,
  IndexTop,
  MobileIndexTitle,
  Page,
} from './SettingsPage.styles';
import { flaggedRows, visibleSections } from './sections';

/**
 * The settings index a phone sees at `/settings`: one row per section, then
 * the pages that exist only behind a feature flag (Automations, Developers,
 * Approvals), each opening its own screen.
 */
export function SettingsIndexPage() {
  const sections = visibleSections();
  const extra = flaggedRows(readIsMobileViewport());
  return (
    <Page>
      <IndexTop>
        <MobileIndexTitle>Settings</MobileIndexTitle>
      </IndexTop>
      <IndexList aria-label="Settings">
        {sections.map((s) => (
          <li key={s.id}>
            <IndexLink to={`/settings/${s.id}`}>
              <IndexIcon>
                <Icon icon={s.icon} size={20} />
              </IndexIcon>
              <Grow>{s.label}</Grow>
              <Chevron>
                <Icon icon={ChevronRight} size={20} />
              </Chevron>
            </IndexLink>
          </li>
        ))}
        {extra.map((row) => (
          <li key={row.to}>
            <IndexLink to={row.to}>
              <Grow>{row.label}</Grow>
              <Chevron>
                <Icon icon={ChevronRight} size={20} />
              </Chevron>
            </IndexLink>
          </li>
        ))}
      </IndexList>
    </Page>
  );
}
