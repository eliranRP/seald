import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styled from 'styled-components';

export type SettingsVariant = 'desktop' | 'mobile';

export interface SettingsFrameProps {
  readonly variant: SettingsVariant;
  readonly title: string;
  /** Where Back goes. The index has none. */
  readonly backTo?: string | undefined;
  readonly children: ReactNode;
}

const DesktopPage = styled.div`
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: ${({ theme }) => `${theme.space[6]} ${theme.space[4]} ${theme.space[20]}`};
`;

const MobilePage = styled.div`
  min-height: 100dvh;
  background: ${({ theme }) => theme.color.bg.app};
`;

const MobileHeader = styled.header`
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[3]};
  height: 52px;
  padding: env(safe-area-inset-top) ${({ theme }) => theme.space[3]} 0;
  box-sizing: content-box;
  background: ${({ theme }) => theme.color.paper};
  border-bottom: 1px solid ${({ theme }) => theme.color.border[1]};
`;

const BackButton = styled.button`
  width: 44px;
  height: 44px;
  border: none;
  border-radius: ${({ theme }) => theme.radius.md};
  background: ${({ theme }) => theme.color.bg.sunken};
  color: ${({ theme }) => theme.color.fg[1]};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

const MobileTitle = styled.h1`
  margin: 0;
  font-size: 17px;
  font-weight: ${({ theme }) => theme.font.weight.semibold};
  color: ${({ theme }) => theme.color.fg[1]};
`;

const MobileBody = styled.div`
  padding: ${({ theme }) => `${theme.space[5]} ${theme.space[4]}`};
`;

const Crumbs = styled.nav`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.space[2]};
  font-size: ${({ theme }) => theme.font.size.caption};
  color: ${({ theme }) => theme.color.fg[3]};
`;

const CrumbLink = styled(Link)`
  color: ${({ theme }) => theme.color.fg[3]};

  &:focus-visible {
    outline: 2px solid ${({ theme }) => theme.color.indigo[500]};
    outline-offset: 2px;
  }
`;

const DesktopTitle = styled.h1`
  margin: ${({ theme }) => `${theme.space[4]} 0 ${theme.space[6]}`};
  font-family: ${({ theme }) => theme.font.serif};
  font-size: ${({ theme }) => theme.font.size.h2};
  font-weight: ${({ theme }) => theme.font.weight.medium};
  color: ${({ theme }) => theme.color.fg[1]};
`;

/**
 * One frame for the settings index and the Developers page. Desktop sits
 * inside `AppShell` with a breadcrumb; phone is its own screen with a Back
 * button. The content is the same component tree at both widths.
 */
export function SettingsFrame({ variant, title, backTo, children }: SettingsFrameProps) {
  const navigate = useNavigate();
  if (variant === 'mobile') {
    return (
      <MobilePage>
        <MobileHeader>
          <BackButton
            type="button"
            aria-label="Back"
            onClick={() => {
              navigate(backTo ?? '/m/send');
            }}
          >
            <ArrowLeft size={20} aria-hidden />
          </BackButton>
          <MobileTitle>{title}</MobileTitle>
        </MobileHeader>
        <MobileBody>{children}</MobileBody>
      </MobilePage>
    );
  }
  return (
    <DesktopPage>
      {backTo ? (
        <Crumbs aria-label="Breadcrumb">
          <CrumbLink to={backTo}>Settings</CrumbLink>
          <span aria-hidden>/</span>
          <span aria-current="page">{title}</span>
        </Crumbs>
      ) : null}
      <DesktopTitle>{title}</DesktopTitle>
      {children}
    </DesktopPage>
  );
}
