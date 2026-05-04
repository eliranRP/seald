import type { JSX } from 'react';
import { Button } from '@/components/Button';
import { Actions, Body, Card, Spinner, Title } from './DrivePicker.styles';

/**
 * Stateless overlay panes shown while Google's official picker is
 * loading or has failed to load. The picker iframe itself replaces
 * this overlay once Google's UI takes over the viewport.
 */

export function LoadingOverlay(): JSX.Element {
  return (
    <Card role="status" aria-live="polite" aria-label="Loading Google Drive picker">
      <Spinner aria-hidden />
      <Title>Opening Google Drive…</Title>
      <Body>Fetching a fresh access token and loading Google&rsquo;s picker UI.</Body>
    </Card>
  );
}

export interface NotConfiguredStateProps {
  readonly onClose: () => void;
}

export function NotConfiguredState({ onClose }: NotConfiguredStateProps): JSX.Element {
  return (
    <Card role="alert">
      <Title>Drive picker is not configured</Title>
      <Body>
        Drive picker is not configured on this server. An administrator needs to set
        <code> GDRIVE_PICKER_DEVELOPER_KEY</code> and <code>GDRIVE_PICKER_APP_ID</code> before this
        feature is available.
      </Body>
      <Actions>
        <Button variant="primary" type="button" onClick={onClose}>
          Close
        </Button>
      </Actions>
    </Card>
  );
}

export interface LoadFailedStateProps {
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

export function LoadFailedState({ onRetry, onClose }: LoadFailedStateProps): JSX.Element {
  return (
    <Card role="alert">
      <Title>Couldn&rsquo;t load Google&rsquo;s Drive picker</Title>
      <Body>
        The Google picker library failed to load. This is usually a transient network blip — try
        again.
      </Body>
      <Actions>
        <Button variant="primary" type="button" onClick={onRetry}>
          Retry
        </Button>
        <Button variant="ghost" type="button" onClick={onClose}>
          Cancel
        </Button>
      </Actions>
    </Card>
  );
}
