import { useState } from 'react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import styled from 'styled-components';
import { isFeatureEnabled } from 'shared';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { DrivePicker } from '../components/drive-picker';
import {
  ConversionFailedDialog,
  ConversionProgressDialog,
  useDriveImport,
} from '../features/gdriveImport';
import { UploadPage } from '../pages/UploadPage';
import {
  useConnectGDrive,
  useGDriveAccounts,
  useReconnectGDrive,
} from './settings/integrations/useGDriveAccounts';

const Page = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
`;

const Top = styled.div`
  padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]} 0`};
`;

const Notice = styled.div`
  max-width: 640px;
  margin: 0 auto;
  padding: ${({ theme }) => `0 ${theme.space[4]}`};
`;

/**
 * `/templates/new`: pick a sample document (from the computer or Google
 * Drive), then the editor opens in template mode to place the fields. Save
 * template creates it and returns to the list.
 */
export function NewTemplateRoute(): JSX.Element {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const open = (file: File): void => {
    // The sample's file name is a fair first template name; it renames inline.
    const name = file.name.replace(/\.[^.]+$/, '').trim();
    navigate('/templates/new/edit', {
      state: { pendingFile: file, ...(name ? { templateRename: name } : {}) },
    });
  };

  const gdriveOn = isFeatureEnabled('gdriveIntegration');
  const accountsQuery = useGDriveAccounts();
  const accounts = gdriveOn ? (accountsQuery.data ?? []) : [];
  const driveAccountId = accounts[0]?.id ?? null;
  const connectDrive = useConnectGDrive();
  const reconnectDrive = useReconnectGDrive();
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  const driveImport = useDriveImport({ accountId: driveAccountId ?? '', onReady: open });

  return (
    <Page>
      <Top>
        <Button
          variant="ghost"
          size="sm"
          iconLeft={ArrowLeft}
          onClick={() => navigate('/templates')}
        >
          Templates
        </Button>
      </Top>
      <UploadPage
        title="New template"
        subtitle="Upload a sample document. You place the fields once; every use reuses them."
        dropHeading="Drop a sample PDF"
        dropSubheading="We use it to place fields · up to 25 MB"
        onFileSelected={(file) => {
          setError(null);
          open(file);
        }}
        onError={(_code, message) => setError(message)}
        {...(gdriveOn && driveAccountId !== null
          ? { onPickDrive: () => setDrivePickerOpen(true) }
          : {})}
        {...(gdriveOn && driveAccountId === null
          ? { onConnectDrive: () => connectDrive.mutate() }
          : {})}
      />
      {error ? (
        <Notice>
          <Banner tone="error">{error}</Banner>
        </Notice>
      ) : null}
      {gdriveOn && driveAccountId !== null ? (
        <DrivePicker
          open={drivePickerOpen}
          accountId={driveAccountId}
          onClose={() => setDrivePickerOpen(false)}
          onReconnect={() => reconnectDrive.mutate()}
          onPick={(file) => {
            setDrivePickerOpen(false);
            driveImport.beginImport(file);
          }}
        />
      ) : null}
      <ConversionProgressDialog
        open={driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'}
        fileName={
          driveImport.state.kind === 'starting' || driveImport.state.kind === 'running'
            ? driveImport.state.file.name
            : ''
        }
        onCancel={() => {
          void driveImport.cancelImport();
        }}
      />
      <ConversionFailedDialog
        open={driveImport.state.kind === 'failed'}
        errorCode={
          driveImport.state.kind === 'failed' ? driveImport.state.error : 'conversion-failed'
        }
        onRetry={() => {
          driveImport.reset();
          setDrivePickerOpen(true);
        }}
        onClose={() => driveImport.reset()}
      />
    </Page>
  );
}
