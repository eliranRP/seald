import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/Button';
import { reportError } from '@/lib/observability';
import { Actions, Message, Panel, Shell, Title } from './ErrorBoundary.styles';

export type ErrorBoundaryFallback =
  | ReactNode
  | ((props: { readonly error: Error; readonly reset: () => void }) => ReactNode);

export interface ErrorBoundaryProps {
  readonly children: ReactNode;
  readonly fallback?: ErrorBoundaryFallback;
  readonly onError?: (error: Error) => void;
}

interface State {
  readonly error: Error | null;
}

interface DefaultFallbackProps {
  readonly reset: () => void;
}

/**
 * Default "Something went wrong" panel. Used when no custom fallback prop is
 * supplied. Mirrors the app's design tokens via styled-components and exposes
 * `role="alert"` plus a labelled "Try again" button so accessibility tests
 * (rule 4.6) can reach it by role/name.
 */
function DefaultFallback({ reset }: DefaultFallbackProps): JSX.Element {
  return (
    <Shell role="alert">
      <Panel>
        <Title>Something went wrong</Title>
        <Message>
          We hit an unexpected error loading this page. Try again — if the problem persists, reload
          the page.
        </Message>
        <Actions>
          <Button variant="primary" size="md" onClick={reset} aria-label="Try again">
            Try again
          </Button>
        </Actions>
      </Panel>
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
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    const { onError } = this.props;
    reportError(error, { componentStack: info.componentStack ?? null });
    onError?.(error);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;

    if (typeof fallback === 'function') {
      return fallback({ error, reset: this.reset });
    }
    if (fallback !== undefined) {
      return fallback;
    }
    return <DefaultFallback reset={this.reset} />;
  }
}
