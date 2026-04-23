import { QueryClient } from '@tanstack/react-query';

/**
 * Single shared `QueryClient` instance for the app. Queries refetch on mount
 * (but not on every window focus) and retry once — the API's 401s are
 * already redirected to sign-in by our `apiFetch` wrappers, so retries only
 * help transient network blips.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30_000,
    },
    mutations: {
      retry: 0,
    },
  },
});
