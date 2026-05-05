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
      <Spinner $size={28} $borderWidth={3} aria-hidden />
      <Title>Opening Google Drive…</Title>
      <Body>Fetching a fresh access token and loading Google&rsquo;s picker UI.</Body>
    </Card>
  );
}

export interface NotConfiguredStateProps {
  readonly onClose: () => void;
}

export function NotConfiguredState({ onClose }: NotConfiguredStateProps): JSX.Element {
  // 2026-05-04 — prior copy named the missing env vars
  // (GDRIVE_PICKER_DEVELOPER_KEY / GDRIVE_PICKER_APP_ID) directly in
  // a user-facing modal. End users can't act on env-var names; admins
  // already have the operational details in CLAUDE.md. Keep this copy
  // user-friendly and point at "an administrator" instead.
  return (
    <Card role="alert">
      <Title>Drive picker isn&rsquo;t available</Title>
      <Body>
        Picking from Google Drive isn&rsquo;t available on this server right now. Please contact
        your administrator.
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
