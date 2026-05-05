import { useCallback, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Cloud, CheckCircle2 } from 'lucide-react';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import {
  useGDriveAccounts,
  useDisconnectGDrive,
} from '@/routes/settings/integrations/useGDriveAccounts';
import { apiClient } from '@/lib/api/apiClient';
import { DisconnectModal } from '@/routes/settings/integrations/DisconnectModal';

const Page = styled.div`
  min-height: 100dvh;
  background: var(--bg-0);
`;

const Header = styled.header`
  position: sticky;
  top: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: 12px;
  height: 52px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 0.5px solid rgba(0, 0, 0, 0.08);
`;

const BackBtn = styled.button`
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--ink-100);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg-1);
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const HeaderTitle = styled.h1`
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--fg-1);
  letter-spacing: -0.01em;
`;

const Content = styled.div`
  padding: 20px 16px;
`;

const Card = styled.div`
  background: #fff;
  border: 1px solid var(--border-1);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 1px 2px rgba(11, 18, 32, 0.04);
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const CardIcon = styled.div`
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--indigo-50);
  color: var(--indigo-600);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const CardTitle = styled.h2`
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--fg-1);
`;

const ConnectedInfo = styled.div`
  padding: 12px 14px;
  background: var(--bg-sunken, #f8f9fa);
  border: 1px solid var(--border-1);
  border-radius: 12px;
  margin-bottom: 16px;
`;

const ConnectedEmail = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-1);
`;

const ConnectedDate = styled.div`
  font-size: 12px;
  color: var(--fg-3);
  margin-top: 4px;
`;

const ActionBtn = styled.button<{ $variant?: 'primary' | 'danger' }>`
  width: 100%;
  height: 48px;
  border-radius: 12px;
  border: none;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  background: ${({ $variant }) =>
    $variant === 'danger' ? 'var(--danger-50, #fef2f2)' : 'var(--indigo-600)'};
  color: ${({ $variant }) => ($variant === 'danger' ? 'var(--danger-700, #b91c1c)' : '#fff')};

  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  &:focus-visible {
    outline: 2px solid var(--indigo-600);
    outline-offset: 2px;
  }
`;

const SuccessToast = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  background: var(--success-50, #ecfdf5);
  border: 1px solid var(--success-200, #a7f3d0);
  border-radius: 12px;
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--success-700, #047857);
  font-weight: 500;
`;

const EmptyNote = styled.p`
  font-size: 14px;
  color: var(--fg-3);
  margin: 0 0 16px;
  line-height: 1.5;
`;

/**
 * Mobile integrations settings screen. Allows users to connect/disconnect
 * their Google Drive account. Accessible from the hamburger menu on /m/send.
 */
export function MWIntegrations(): ReactNode {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const showSuccess = searchParams.get('connected') === '1';

  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const { data: accounts, isLoading } = useGDriveAccounts();
  const disconnectMutation = useDisconnectGDrive();

  const [disconnectTarget, setDisconnectTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);

  const handleBack = useCallback((): void => {
    navigate('/m/send');
  }, [navigate]);

  const handleConnect = useCallback(async (): Promise<void> => {
    try {
      const ret = encodeURIComponent('/m/send/drive');
      const res = await apiClient.get<{ url: string }>(
        `/integrations/gdrive/oauth/url?return=${ret}`,
      );
      window.location.href = res.data.url;
    } catch {
      // Silently fail — user can retry.
    }
  }, []);

  const handleDisconnectClick = useCallback((id: string, email: string): void => {
    setDisconnectTarget({ id, email });
  }, []);

  const handleDisconnectConfirm = useCallback((): void => {
    if (!disconnectTarget) return;
    disconnectMutation.mutate(disconnectTarget.id, {
      onSuccess: () => {
        setDisconnectTarget(null);
      },
    });
  }, [disconnectTarget, disconnectMutation]);

  const handleDisconnectClose = useCallback((): void => {
    setDisconnectTarget(null);
  }, []);

  const connectedAccount = accounts?.[0];

  if (!gdriveOn) {
    return (
      <Page>
        <Header>
          <BackBtn type="button" aria-label="Back" onClick={handleBack}>
            <ArrowLeft size={18} aria-hidden />
          </BackBtn>
          <HeaderTitle>Integrations</HeaderTitle>
        </Header>
        <Content>
          <EmptyNote>No integrations available.</EmptyNote>
        </Content>
      </Page>
    );
  }

  return (
    <Page>
      <Header>
        <BackBtn type="button" aria-label="Back" onClick={handleBack}>
          <ArrowLeft size={18} aria-hidden />
        </BackBtn>
        <HeaderTitle>Integrations</HeaderTitle>
      </Header>
      <Content>
        {showSuccess && (
          <SuccessToast role="status" aria-live="polite">
            <CheckCircle2 size={18} aria-hidden />
            Google Drive connected successfully
          </SuccessToast>
        )}
        <Card>
          <CardHeader>
            <CardIcon aria-hidden>
              <Cloud size={20} />
            </CardIcon>
            <CardTitle>Google Drive</CardTitle>
          </CardHeader>
          {isLoading ? (
            <EmptyNote>Loading...</EmptyNote>
          ) : connectedAccount ? (
            <>
              <ConnectedInfo>
                <ConnectedEmail>{connectedAccount.email}</ConnectedEmail>
                <ConnectedDate>
                  Connected{' '}
                  {new Date(connectedAccount.connectedAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </ConnectedDate>
              </ConnectedInfo>
              <ActionBtn
                type="button"
                $variant="danger"
                onClick={() => handleDisconnectClick(connectedAccount.id, connectedAccount.email)}
              >
                Disconnect
              </ActionBtn>
            </>
          ) : (
            <>
              <EmptyNote>
                Connect your Google Drive to import documents directly from your cloud storage.
              </EmptyNote>
              <ActionBtn type="button" onClick={handleConnect}>
                Connect Google Drive
              </ActionBtn>
            </>
          )}
        </Card>
      </Content>
      <DisconnectModal
        open={disconnectTarget !== null}
        accountEmail={disconnectTarget?.email ?? ''}
        pending={disconnectMutation.isPending}
        error={disconnectMutation.error?.message ?? null}
        onClose={handleDisconnectClose}
        onConfirm={handleDisconnectConfirm}
      />
    </Page>
  );
}
