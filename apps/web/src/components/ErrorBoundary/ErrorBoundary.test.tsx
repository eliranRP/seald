import { useState } from 'react';
import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithTheme } from '../../test/renderWithTheme';
import { ErrorBoundary } from './ErrorBoundary';

vi.mock('../../lib/observability', () => ({
  reportError: vi.fn(),
  initSentry: vi.fn(),
}));

// React intentionally logs caught errors to console.error in dev. Silence
// it for these tests so the suite output isn't polluted.
let consoleSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleSpy.mockRestore();
});

function Boom({ shouldThrow }: { readonly shouldThrow: boolean }): JSX.Element {
  if (shouldThrow) throw new Error('Kaboom');
  return <div>safe-content</div>;
}

/**
 * Toggle harness: starts in "throwing" state, exposes a button outside the
 * boundary that flips the throw flag. Combined with the boundary's "Try
 * again" reset, this lets us assert recovery once the underlying error
 * condition clears.
 */
function ResetHarness(): JSX.Element {
  const [shouldThrow, setShouldThrow] = useState(true);
  return (
    <div>
      <button type="button" onClick={() => setShouldThrow(false)}>
        clear-error
      </button>
      <ErrorBoundary>
        <Boom shouldThrow={shouldThrow} />
      </ErrorBoundary>
    </div>
  );
}

describe('ErrorBoundary', () => {
  it('renders children when no error is thrown', () => {
    renderWithTheme(
      <ErrorBoundary>
        <Boom shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText('safe-content')).toBeInTheDocument();
  });

  it('catches a render error, shows the fallback, and calls onError', () => {
    const onError = vi.fn();
    renderWithTheme(
      <ErrorBoundary onError={onError}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect((onError.mock.calls[0]?.[0] as Error).message).toBe('Kaboom');
  });

  it('renders a labelled "Try again" button by accessible role + name', () => {
    renderWithTheme(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reset restores children once the error condition clears', async () => {
    const user = userEvent.setup();
    renderWithTheme(<ResetHarness />);

    expect(screen.getByRole('alert')).toBeInTheDocument();

    // Clear the underlying throw flag *before* resetting the boundary.
    await user.click(screen.getByRole('button', { name: /clear-error/i }));
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('safe-content')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders a custom render-prop fallback with error + reset', async () => {
    const user = userEvent.setup();
    const fallback = vi.fn(({ error, reset }: { error: Error; reset: () => void }) => (
      <div>
        <p>custom-fallback: {error.message}</p>
        <button type="button" onClick={reset}>
          custom-reset
        </button>
      </div>
    ));

    function CustomHarness(): JSX.Element {
      const [shouldThrow, setShouldThrow] = useState(true);
      return (
        <div>
          <button type="button" onClick={() => setShouldThrow(false)}>
            clear-custom
          </button>
          <ErrorBoundary fallback={fallback}>
            <Boom shouldThrow={shouldThrow} />
          </ErrorBoundary>
        </div>
      );
    }

    renderWithTheme(<CustomHarness />);
    expect(screen.getByText('custom-fallback: Kaboom')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear-custom/i }));
    await user.click(screen.getByRole('button', { name: /custom-reset/i }));
    expect(screen.getByText('safe-content')).toBeInTheDocument();
  });
});
