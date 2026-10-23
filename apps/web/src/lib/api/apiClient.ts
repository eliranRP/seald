import axios from 'axios';
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Clock } from 'lucide-react';
import { supabase } from '../supabase/supabaseClient';
import { publishNotice, raiseSessionExpired, setMaintenance } from '../system/systemStore';

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
 * by the gdrive surfaces and others, else the `{ error: '<slug>' }` of the
 * global filter); `retryAfter` mirrors the seconds-
 * to-wait hint a `429` body may carry.
 */
export interface ApiError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

/** Rate-limit toast fallback when the API sends no usable Retry-After. */
const DEFAULT_RETRY_AFTER_SECONDS = 30;

type RetriableConfig = InternalAxiosRequestConfig & { _sealdAuthRetried?: boolean };

function headerString(err: AxiosError, name: string): string | undefined {
  const value: unknown = err.response?.headers?.[name];
  return typeof value === 'string' ? value : undefined;
}

function retryAfterSeconds(err: AxiosError, bodyValue: unknown): number | undefined {
  const raw = Number(headerString(err, 'retry-after'));
  if (Number.isFinite(raw) && raw > 0) return Math.ceil(raw);
  if (typeof bodyValue === 'number' && bodyValue > 0) return Math.ceil(bodyValue);
  return undefined;
}

/**
 * System-level reactions that no caller should have to repeat (design
 * System.dc: session, rate limit, maintenance). 401: one silent token
 * refresh and replay; if the refresh fails the "You were signed out" dialog
 * opens and the page stays mounted. 429: a toast with the wait. 503 with
 * `x-maintenance: 1`: the maintenance page.
 */
async function reactToSystemStatus(error: AxiosError, retryAfter: number | undefined) {
  const status = error.response?.status;
  if (status === 429) {
    const seconds = retryAfter ?? DEFAULT_RETRY_AFTER_SECONDS;
    publishNotice(
      {
        title: `Too many requests \u00b7 try in ${String(seconds)} s`,
        tone: 'info',
        icon: Clock,
        duration: seconds * 1000,
      },
      'rate-limit',
    );
    return undefined;
  }
  if (status === 503 && headerString(error, 'x-maintenance') === '1') {
    const eta = (error.response?.data as { eta_minutes?: unknown } | undefined)?.eta_minutes;
    setMaintenance(true, typeof eta === 'number' ? eta : null);
    return undefined;
  }
  if (status === 401) {
    const config = error.config as RetriableConfig | undefined;
    const hadToken = Boolean(config?.headers?.get('Authorization'));
    if (!config || !hadToken) return undefined;
    if (!config._sealdAuthRetried) {
      config._sealdAuthRetried = true;
      const { data, error: refreshError } = await supabase.auth
        .refreshSession()
        .catch(() => ({ data: { session: null }, error: new Error('refresh_failed') }));
      if (!refreshError && data.session) {
        return apiClient.request(config);
      }
    }
    raiseSessionExpired();
  }
  return undefined;
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const message = messageFromAxiosError(error);
      const wrapped: ApiError = new Error(message);
      if (error.response?.status !== undefined) {
        wrapped.status = error.response.status;
      }
      const body = error.response?.data as
        | {
            readonly code?: unknown;
            readonly error?: unknown;
            readonly retryAfter?: unknown;
          }
        | undefined;
      if (typeof body?.code === 'string') {
        wrapped.code = body.code;
      } else if (typeof body?.error === 'string') {
        // `HttpExceptionFilter` answers `{ error: <slug> }`. Keep the slug so a
        // caller can branch on it, for example `fresh_login_required` (WP-22).
        wrapped.code = body.error;
      }
      const retryAfter = retryAfterSeconds(error, body?.retryAfter);
      if (retryAfter !== undefined) {
        wrapped.retryAfter = retryAfter;
      }
      const replayed = await reactToSystemStatus(error, retryAfter);
      if (replayed) return replayed;
      throw wrapped;
    }
    throw error;
  },
);
