import { Navigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Icon } from '@/components/Icon';
import { readIsMobileViewport } from '@/hooks/useIsMobileViewport';
import { FocusedShell } from '@/layout/shellChrome';
import { AccountSection } from './AccountSection';
import { IntegrationsSection } from './IntegrationsSection';
import { NotificationsSection } from './NotificationsSection';
import { SettingsIndexPage } from './SettingsIndexPage';
import { ProfileSection } from './ProfileSection';
import { SignatureSection } from './SignatureSection';
import {
  BackLink,
  Layout,
  MobileTitle,
  MobileTop,
  NavDivider,
  Page,
  PageTitle,
  SideLink,
  SideNav,
} from './SettingsPage.styles';
import { flaggedRows, isSectionId, visibleSections, type SettingsSectionId } from './sections';

function SectionBody({ id }: { readonly id: SettingsSectionId }) {
  switch (id) {
    case 'profile':
      return <ProfileSection />;
    case 'signature':
      return <SignatureSection />;
    case 'notifications':
      return <NotificationsSection />;
    case 'integrations':
      return <IntegrationsSection />;
    case 'account':
      return <AccountSection />;
  }
}

/**
 * `/settings/:section` — left section nav with one section on the right.
 * On a phone the nav is replaced by a Back arrow to the settings index
 * (`/settings`), so each section is its own screen.
 */
export function SettingsPage() {
  const { section } = useParams<{ section: string }>();
  if (!isSectionId(section)) return <Navigate to="/settings/profile" replace />;

  const sections = visibleSections();
  const current = sections.find((s) => s.id === section);
  const extra = flaggedRows(false);

  return (
    <Page>
      {/* The phone board gives each section its own back header in place of
          the app top bar and bottom nav. */}
      {readIsMobileViewport() ? <FocusedShell /> : null}
      <PageTitle>Settings</PageTitle>
      <MobileTop>
        <BackLink to="/settings" aria-label="Back to settings">
          <Icon icon={ChevronLeft} size={20} />
        </BackLink>
        <MobileTitle>{current?.label}</MobileTitle>
      </MobileTop>
      <Layout>
        <SideNav aria-label="Settings sections">
          {sections.map((s) => (
            <SideLink key={s.id} to={`/settings/${s.id}`}>
              <Icon icon={s.icon} size={16} />
              {s.label}
            </SideLink>
          ))}
          {extra.length > 0 ? <NavDivider /> : null}
          {extra.map((row) => (
            <SideLink key={row.to} to={row.to}>
              {row.label}
            </SideLink>
          ))}
        </SideNav>
        <SectionBody id={section} />
      </Layout>
    </Page>
  );
}

/**
 * `/settings` — desktop goes straight to Profile; a phone gets the index.
 * The viewport is read once, synchronously, so the phone never flashes a
 * redirect first.
 */
export function SettingsRoot() {
  if (readIsMobileViewport()) return <SettingsIndexPage />;
  return <Navigate to="/settings/profile" replace />;
}
