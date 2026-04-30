import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { SupabaseAdminClient, SupabaseAdminError } from './supabase-admin.client';

/**
 * HTTP adapter that talks to Supabase's GoTrue admin API. Construction
 * never fails — the env var gate runs at *call* time so the API can
 * boot in dev/test without a service-role key. T-20 deletes only need
 * to work in production where the key is required.
 */
@Injectable()
export class SupabaseAdminHttpClient extends SupabaseAdminClient {
  private readonly logger = new Logger(SupabaseAdminHttpClient.name);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {
    super();
  }

  async deleteUser(userId: string): Promise<void> {
    const key = this.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new SupabaseAdminError('SUPABASE_SERVICE_ROLE_KEY is not configured');
    }
    const url = `${this.env.SUPABASE_URL.replace(/\/+$/, '')}/auth/v1/admin/users/${encodeURIComponent(userId)}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: 'DELETE',
        headers: {
          // Supabase admin endpoints require BOTH the service-role key
          // as the bearer token and as the `apikey` header — they fail
          // with 401 if either is missing.
          authorization: `Bearer ${key}`,
          apikey: key,
        },
      });
    } catch (err) {
      // Network-level failure (DNS, refused, abort). Surface to caller
      // so the controller maps to 503.
      const msg = err instanceof Error ? err.message : 'unknown';
      throw new SupabaseAdminError(`supabase admin delete failed: ${msg}`);
    }
    // 200 = deleted; 404 = already gone (idempotent). Anything else is a
    // genuine error.
    if (res.status === 200 || res.status === 204 || res.status === 404) {
      this.logger.log(`admin deleteUser ok (status=${res.status}) user=${userId}`);
      return;
    }
    let body = '';
    try {
      body = await res.text();
    } catch {
      // ignore — the status alone is enough
    }
    throw new SupabaseAdminError(
      `supabase admin delete returned ${res.status}: ${body.slice(0, 200)}`,
      res.status,
    );
  }
}
