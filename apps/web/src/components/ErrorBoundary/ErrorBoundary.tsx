import { Component } from 'react';
import type { ErrorInfo, JSX, ReactNode } from 'react';
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/Button';
import { StatePage } from '@/components/StatePage';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { generateErrorId } from '@/lib/system/errorId';
import { reportError } from '@/lib/observability';
import { ErrorId, IdRow, Shell } from './ErrorBoundary.styles';

export type ErrorBoundaryFallback =
  | ReactNode
  | ((props: {
      readonly error: Error;
      readonly reset: () => void;
      readonly errorId: string;
    }) => ReactNode);

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ErrorBoundaryFallback;
  readonly onError?: (error: Error) => void;
}

interface State {
  readonly error: Error | null;
  readonly errorId: string;
}

interface DefaultFallbackProps {
  readonly reset: () => void;
  readonly errorId: string;
}

/**
 * Default "Something broke" page: alert icon, one title, Try again and a
 * quiet Copy error ID with the mono id (design System.dc, `error`). It never
 * shows the message or the stack; the id is what support asks for. Exposes
 * `role="alert"` so accessibility tests (rule 4.6) reach it by role/name.
 */
function DefaultFallback({ reset, errorId }: DefaultFallbackProps): JSX.Element {
  const { copied, copy } = useCopyToClipboard();
  return (
    <Shell role="alert">
      <StatePage icon={AlertTriangle} tone="bad" title="Something broke">
        <Button variant="primary" size="md" iconLeft={RefreshCw} onClick={reset}>
          Try again
        </Button>
        <IdRow>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={Copy}
            onClick={() => {
              void copy(errorId);
            }}
          >
            {copied ? 'Copied' : 'Copy error ID'}
          </Button>
          <ErrorId>{errorId}</ErrorId>
        </IdRow>
      </StatePage>
    </Shell>
  );
}

/**
 * App-wide error boundary (rule 2.5). Wrap any lazy / async subtree so a
 * chunk-load failure or render-time exception surfaces a recoverable UI
 * instead of a blank page. Captures every caught error through
 * `reportError` (Sentry seam) and exposes a `reset` callback so the user can
 * retry without a full page reload.
 *
 * Function components can't catch render errors, so this is a class. The
 * `onError` prop is the test seam — Sentry capture is best-effort and stays
 * untestable from unit tests by design.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null, errorId: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error, errorId: generateErrorId() };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { onError } = this.props;
    const { errorId } = this.state;
    reportError(error, { componentStack: info.componentStack ?? null, errorId });
    onError?.(error);
  }

  private readonly reset = (): void => {
    this.setState({ error: null, errorId: '' });
  };

  override render(): ReactNode {
    const { error, errorId } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (typeof fallback === 'function') {
      return fallback({ error, reset: this.reset, errorId });
    }
    if (fallback !== undefined) {
      return fallback;
    }
    return <DefaultFallback reset={this.reset} errorId={errorId} />;
  }
}
