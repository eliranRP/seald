import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Axios instance for the public `/approve` page.
 *
 * The page has no Supabase session and must not pull the auth client in, so
 * this does not share `apiClient`. `withCredentials` is on because the
 * preview sets the CSRF nonce cookie and the decision POST must send it back.
 *
 * The raw link token only ever travels in a POST body. The error wrapper
 * keeps the status and the API's `{ error: <slug> }` value and nothing else,
 * so a failed call never puts the token into a message or a log.
 */
const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;
if (!BASE) {
  throw new Error('Missing VITE_API_BASE_URL');
}

export const approvalsPublicClient: AxiosInstance = axios.create({
  baseURL: BASE,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export interface ApprovalApiError extends Error {
  status?: number;
  /** The API's slug, for example `csrf_invalid` or `session_required`. */
  slug?: string;
}

approvalsPublicClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const slug = (error.response?.data as { readonly error?: unknown } | undefined)?.error;
      const wrapped: ApprovalApiError = new Error(
        typeof slug === 'string' ? slug : 'approval_request_failed',
      );
      if (error.response?.status !== undefined) wrapped.status = error.response.status;
      if (typeof slug === 'string') wrapped.slug = slug;
      throw wrapped;
    }
    throw new Error('approval_request_failed');
  },
);
