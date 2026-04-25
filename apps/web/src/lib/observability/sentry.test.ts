import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Sentry from '@sentry/react';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  browserTracingIntegration: vi.fn(() => ({ name: 'browserTracing' })),
  replayIntegration: vi.fn(() => ({ name: 'replay' })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('initSentry', () => {
  it('is a no-op when VITE_SENTRY_DSN is undefined', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('initialises with the provided DSN and integrations', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@sentry.io/1');
    const { initSentry } = await import('./sentry');
    initSentry();
    expect(Sentry.init).toHaveBeenCalledTimes(1);
    const arg = (Sentry.init as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0] as
      | { dsn: string; tracesSampleRate: number; replaysOnErrorSampleRate: number }
      | undefined;
    expect(arg?.dsn).toBe('https://abc@sentry.io/1');
    expect(arg?.tracesSampleRate).toBe(0.1);
    expect(arg?.replaysOnErrorSampleRate).toBe(1.0);
  });
});

describe('reportError', () => {
  it('forwards the error to Sentry.captureException', async () => {
    const { reportError } = await import('./sentry');
    const err = new Error('boom');
    reportError(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it('attaches extra context when provided', async () => {
    const { reportError } = await import('./sentry');
    const err = new Error('with-ctx');
    reportError(err, { route: '/document/42' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { route: '/document/42' },
    });
  });
});
