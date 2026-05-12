import axios from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { supabase } from '../supabase/supabaseClient';

/**
 * Shared axios instance for every call to the Nest API.
 *
 * A request interceptor pulls the current Supabase access token at request
 * time and sets `Authorization: Bearer …` — so callers never have to think
 * about auth, and a token refreshed mid-session is picked up automatically.
 * A response interceptor normalises non-2xx errors into a plain `Error` with
 * a helpful message (prefers the API's `{ message }` body, falls back to the
 * HTTP status text) so React-Query's `error` and catch sites get something
 * human-readable without every caller repeating the same body-parse dance.
 */
const BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

if (!BASE) {
  throw new Error('Missing VITE_API_BASE_URL');
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  } else {
    config.headers.delete('Authorization');
  }
  return config;
});

function messageFromAxiosError(err: AxiosError): string {
  const body = err.response?.data as
    | { readonly message?: string | ReadonlyArray<string> }
    | undefined;
  if (body?.message) {
    return Array.isArray(body.message) ? body.message.join(', ') : String(body.message);
  }
  if (err.response?.statusText) {
    return err.response.statusText;
  }
  // Bug C (2026-05-03): when the request never reached the server (no
  // response object) axios reports `err.message === 'Network Error'`
  // (ERR_NETWORK) or `'timeout of …ms exceeded'` (ECONNABORTED) — both
  // are too cryptic for the Send banner. Rewrite to actionable copy that
  // names the connection failure mode so the user knows it isn't their
  // input that's wrong.
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return err.message ?? 'Request failed';
}

/**
 * Error shape thrown by `apiClient` after the response interceptor wraps
 * an axios error into something with a helpful `message` and the original
 * HTTP status attached. `code` carries the API's machine-readable error
 * code when the response body included one (`{ code, message }` shape used
 * by the gdrive surfaces and others); `retryAfter` mirrors the seconds-
 * to-wait hint a `429` body may carry.
 */
export interface ApiError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const message = messageFromAxiosError(error);
      const wrapped: ApiError = new Error(message);
      if (error.response?.status !== undefined) {
        wrapped.status = error.response.status;
      }
      const body = error.response?.data as
        | { readonly code?: unknown; readonly retryAfter?: unknown }
        | undefined;
      if (typeof body?.code === 'string') {
        wrapped.code = body.code;
      }
      if (typeof body?.retryAfter === 'number') {
        wrapped.retryAfter = body.retryAfter;
      }
      throw wrapped;
    }
    throw error;
  },
);
