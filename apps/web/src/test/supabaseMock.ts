import { vi } from 'vitest';

/**
 * Builds a minimal Supabase client stand-in for tests. Exports a factory
 * (rather than a singleton) so each test file can capture its own call
 * spies without leaking state across suites. Extend as new auth paths are
 * exercised from tests.
 */
export interface SupabaseMockOptions {
  readonly initialSession?: {
    readonly user: {
      readonly id: string;
      readonly email: string;
      readonly user_metadata?: Record<string, unknown>;
    };
    readonly access_token?: string;
  } | null;
}

export function createSupabaseMock(options: SupabaseMockOptions = {}) {
  const initialSession = options.initialSession ?? null;
  const listeners = new Set<(event: string, session: unknown) => void>();

  const auth = {
    getSession: vi.fn(async () => ({ data: { session: initialSession }, error: null })),
    onAuthStateChange: vi.fn((cb: (event: string, session: unknown) => void) => {
      listeners.add(cb);
      return { data: { subscription: { unsubscribe: () => listeners.delete(cb) } } };
    }),
    signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: null })),
    signUp: vi.fn(async () => ({ data: { session: null, user: null }, error: null })),
    signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  };

  return {
    supabase: { auth },
    setKeepSignedIn: vi.fn(),
    getKeepSignedIn: vi.fn(() => true),
    KEEP_SIGNED_IN_STORAGE_KEY: 'sealed.keepSignedIn',
    __listeners: listeners,
  } as const;
}
