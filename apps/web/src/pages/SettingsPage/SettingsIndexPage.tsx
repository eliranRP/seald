import { ChevronRight } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { Grow, IndexLink, IndexList, MobileTitle, Page, RowIcon } from './SettingsPage.styles';
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
      <MobileTitle>Settings</MobileTitle>
      <IndexList aria-label="Settings">
        {sections.map((s) => (
          <li key={s.id}>
            <IndexLink to={`/settings/${s.id}`}>
              <RowIcon>
                <Icon icon={s.icon} size={14} />
              </RowIcon>
              <Grow>{s.label}</Grow>
              <Icon icon={ChevronRight} size={18} />
            </IndexLink>
          </li>
        ))}
        {extra.map((row) => (
          <li key={row.to}>
            <IndexLink to={row.to}>
              <Grow>{row.label}</Grow>
              <Icon icon={ChevronRight} size={18} />
            </IndexLink>
          </li>
        ))}
      </IndexList>
    </Page>
  );
}
