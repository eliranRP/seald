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

// Explicit `unknown` return-type: vitest 4's `vi.fn` inference references
// internal `.pnpm/@vitest+spy/...` paths, which TS rejects as non-portable
// without an inline annotation. Tests destructure the fields they need;
// `unknown` is honest about how opaque the structure is at the boundary.
export function createSupabaseMock(options: SupabaseMockOptions = {}): {
  readonly supabase: { readonly auth: Record<string, unknown> };
  readonly setKeepSignedIn: (...args: ReadonlyArray<unknown>) => void;
  readonly getKeepSignedIn: () => boolean;
  readonly KEEP_SIGNED_IN_STORAGE_KEY: string;
  readonly __listeners: Set<(event: string, session: unknown) => void>;
} {
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
