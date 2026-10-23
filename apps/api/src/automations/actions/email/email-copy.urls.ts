import type { AppEnv } from '../../../config/env.schema';

/**
 * Public origin of the API, for links in mail that hit the API directly.
 * `API_PUBLIC_URL` wins. Otherwise: localhost app URL maps to
 * `http://localhost:<PORT>`, anything else to `https://api.<app host>`
 * (production is `seald.nromomentum.com` -> `api.seald.nromomentum.com`).
 */
export function apiPublicUrl(
  env: Pick<AppEnv, 'API_PUBLIC_URL' | 'APP_PUBLIC_URL' | 'PORT'>,
): string {
  if (env.API_PUBLIC_URL) return env.API_PUBLIC_URL.replace(/\/+$/, '');
  const app = new URL(env.APP_PUBLIC_URL);
  if (app.hostname === 'localhost' || app.hostname === '127.0.0.1') {
    return `http://localhost:${Number(env.PORT) || 3000}`;
  }
  return `${app.protocol}//api.${app.host}`;
}

/** The link in the mail footer. The token is the only credential. */
export function stopUrl(
  env: Pick<AppEnv, 'API_PUBLIC_URL' | 'APP_PUBLIC_URL' | 'PORT'>,
  token: string,
): string {
  return `${apiPublicUrl(env)}/automations/stop?t=${token}`;
}
