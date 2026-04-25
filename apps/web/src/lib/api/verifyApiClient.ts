import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';

/**
 * Axios instance for the public `/verify/:short_code` route.
 *
 * Why a separate instance:
 *  - The verify surface is fully PUBLIC — anyone with a 13-char short_code
 *    can pull envelope metadata + audit timeline. There is NO Supabase
 *    session involved, so we deliberately do not import or attach any
 *    bearer token.
 *  - Mounting the standard `apiClient` here would trigger Supabase session
 *    fetches on every page load, which on a bare `/verify/:code` route
 *    (signed-out browser, possibly an embedded iframe) is wasteful and
 *    leaks the auth client into a page that should be free of it.
 *
 * No `withCredentials` either — there is no cookie surface for verify.
 *
 * A response interceptor mirrors the other clients so callers receive
 * a consistent `ApiError` (`status` + readable `message`) to catch.
 */
const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (!BASE) {
  throw new Error('Missing VITE_API_BASE_URL');
}

export const verifyApiClient: AxiosInstance = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApiError extends Error {
  status?: number;
}

function messageFromAxiosError(err: AxiosError): string {
  const body = err.response?.data as
    | { readonly message?: string | ReadonlyArray<string> }
    | undefined;
  if (body?.message) {
    return Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
  }
  return err.response?.statusText ?? err.message ?? 'Request failed';
}

verifyApiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const wrapped: ApiError = new Error(messageFromAxiosError(error));
      if (error.response?.status !== undefined) {
        wrapped.status = error.response.status;
      }
      throw wrapped;
    }
    throw error;
  },
);
