import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { reportSignerEvent } from './telemetry';

interface Props {
  readonly children: ReactNode;
  readonly envelopeId?: string | null;
}

interface State {
  readonly err: Error | null;
}

function handleReload(): void {
  window.location.reload();
}

/**
 * Error boundary scoped to the `/sign/*` route subtree. On any render error,
 * shows a recoverable "Something went wrong" screen with a Reload button,
 * and logs the error through the signer telemetry seam.
 */
export class SigningErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { err: null };
  }

  static getDerivedStateFromError(err: Error): State {
    return { err };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    const { envelopeId } = this.props;
    reportSignerEvent({
      type: 'sign.error',
      envelope_id: envelopeId ?? null,
      status: (err as Error & { readonly status?: number }).status ?? null,
      message: `${err.message}\n${info.componentStack ?? ''}`,
    });
  }

  override render(): ReactNode {
    const { err } = this.state;
    const { children } = this.props;
    if (!err) return children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          background: '#F8FAFC',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 420,
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: 16,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <h1 style={{ fontSize: 22, margin: 0, color: '#0B1220' }}>Something went wrong</h1>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 12, lineHeight: 1.6 }}>
            We couldn&apos;t complete that action. Reloading the page usually resolves it.
          </p>
          <button
            type="button"
            onClick={handleReload}
            style={{
              marginTop: 20,
              height: 42,
              padding: '0 20px',
              border: 'none',
              borderRadius: 10,
              background: '#0B1220',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
