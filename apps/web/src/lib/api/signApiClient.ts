import axios from 'axios';
import type { AxiosError, AxiosInstance } from 'axios';

/**
 * Axios instance for the signer-facing `/sign/*` routes.
 *
 * Unlike the shared `apiClient`, this one:
 *  - sets `withCredentials: true` so the browser includes the HttpOnly
 *    `seald_sign` cookie automatically, and
 *  - has NO request interceptor — Supabase auth is irrelevant on the
 *    signer surface and shipping the Supabase client into this code path
 *    would violate the isolation boundary enforced by ESLint.
 *
 * A response interceptor mirrors the apiClient one so callers get a
 * consistent `ApiError` (`status` + readable `message`) to catch.
 */
const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (!BASE) {
  throw new Error('Missing VITE_API_BASE_URL');
}

export const signApiClient: AxiosInstance = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApiError extends Error {
  status?: number;
  /** The API's `{ error: <slug> }` value, e.g. `access_code_invalid` (WP-11). */
  code?: string;
  /** `Retry-After` in whole seconds, when the response carried a usable one. */
  retryAfterSeconds?: number;
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

signApiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const wrapped: ApiError = new Error(messageFromAxiosError(error));
      if (error.response?.status !== undefined) {
        wrapped.status = error.response.status;
      }
      const slug = (error.response?.data as { readonly error?: unknown } | undefined)?.error;
      if (typeof slug === 'string') wrapped.code = slug;
      const retryAfter = Number(error.response?.headers?.['retry-after']);
      if (Number.isInteger(retryAfter) && retryAfter > 0) wrapped.retryAfterSeconds = retryAfter;
      throw wrapped;
    }
    throw error;
  },
);
