import type { JSX } from 'react';
import { AlertTriangle, FileSearch, FolderOpen, RefreshCw, WifiOff } from 'lucide-react';
import { useTheme } from 'styled-components';
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import {
  SkeletonRow,
  StateActions,
  StateBadge,
  StateBody,
  StatePane,
  StateTitle,
} from './DrivePicker.styles';

/**
 * Stateless render functions for every non-list state surfaced by the
 * picker. Each maps 1:1 to one of the API DTO's named error codes
 * (`token-expired`, `oauth-declined`, `no-files-match-filter`, …) so
 * state -> code mapping in the controller stays straightforward.
 *
 * The pieces live together in a single file because they all share the
 * same `<StatePane>` skeleton and need identical styling. Splitting
 * each into its own component would only churn the import surface.
 */

export function LoadingState(): JSX.Element {
  return (
    <div role="status" aria-live="polite" aria-label="Loading Drive files">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <SkeletonRow key={i} aria-hidden="true" />
      ))}
    </div>
  );
}

export function EmptyFolderState(): JSX.Element {
  const t = useTheme();
  return (
    <StatePane role="status">
      <StateBadge $bg={t.color.ink[50]} $fg={t.color.fg[3]} aria-hidden>
        <Icon icon={FolderOpen} size={28} />
      </StateBadge>
      <StateTitle>This folder is empty</StateTitle>
      <StateBody>
        We couldn&apos;t find any PDFs, Google Docs, or Word documents here. Try a different folder
        in your Drive.
      </StateBody>
    </StatePane>
  );
}

export interface NoResultsStateProps {
  readonly query: string;
}

export function NoResultsState({ query }: NoResultsStateProps): JSX.Element {
  const t = useTheme();
  return (
    <StatePane role="status">
      <StateBadge $bg={t.color.ink[50]} $fg={t.color.fg[3]} aria-hidden>
        <Icon icon={FileSearch} size={28} />
      </StateBadge>
      <StateTitle>No files match &ldquo;{query}&rdquo;</StateTitle>
      <StateBody>Try a different search term, or pick from the list above.</StateBody>
    </StatePane>
  );
}

export interface TokenExpiredStateProps {
  readonly onReconnect: () => void;
  readonly inFlight: boolean;
}

export function TokenExpiredState({ onReconnect, inFlight }: TokenExpiredStateProps): JSX.Element {
  const t = useTheme();
  return (
    <StatePane role="status">
      <StateBadge $bg={t.color.warn[50]} $fg={t.color.warn[700]} aria-hidden>
        <Icon icon={AlertTriangle} size={28} />
      </StateBadge>
      <StateTitle>Your Google Drive connection expired</StateTitle>
      <StateBody>
        Reconnect to keep importing files. Your in-progress document is safe — we&apos;ll pick up
        where you left off.
      </StateBody>
      <StateActions>
        <Button
          variant="primary"
          iconLeft={RefreshCw}
          onClick={onReconnect}
          loading={inFlight}
          disabled={inFlight}
        >
          Reconnect
        </Button>
      </StateActions>
    </StatePane>
  );
}

export interface NetworkErrorStateProps {
  readonly onRetry: () => void;
}

export function NetworkErrorState({ onRetry }: NetworkErrorStateProps): JSX.Element {
  const t = useTheme();
  return (
    <StatePane role="status">
      <StateBadge $bg={t.color.danger[50]} $fg={t.color.danger[700]} aria-hidden>
        <Icon icon={WifiOff} size={28} />
      </StateBadge>
      <StateTitle>Couldn&apos;t reach Google Drive</StateTitle>
      <StateBody>This is usually temporary. Try again in a few seconds.</StateBody>
      <StateActions>
        <Button variant="primary" iconLeft={RefreshCw} onClick={onRetry}>
          Try again
        </Button>
      </StateActions>
    </StatePane>
  );
}
