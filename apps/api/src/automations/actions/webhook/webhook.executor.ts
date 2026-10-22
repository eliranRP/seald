import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import type { AutomationActionExecutor, AutomationActionOutcome } from '../../automation-actions';
import type { ClaimedAutomationJob } from '../../automations.repository.pg';
import { PinnedRequestError, pinnedPost, type PinnedPostResult } from '../../ssrf/pinned-request';
import {
  defaultResolver,
  effectiveAllowance,
  resolveWebhookTarget,
  sealdOwnHosts,
  type WebhookResolver,
  type WebhookTarget,
  type WebhookTestAllowance,
} from '../../ssrf/webhook-target';
import { SecretBoxError } from './secret-box';
import { buildWebhookPayload, payloadDetailFrom, WEBHOOK_USER_AGENT } from './webhook-payload';
import { signatureHeaders } from './webhook-signature';
import {
  AutomationSecretsNotConfiguredError,
  WebhookSecretsMissingError,
  WebhookSecretsService,
} from './webhook-secrets.service';
import { WebhookPgRepository } from './webhook.repository.pg';
import { WEBHOOK_HTTP_CLIENT, WEBHOOK_RESOLVER, WEBHOOK_TEST_ALLOWANCE } from './webhook.tokens';

/** Design doc § SSRF: 10 s total, 64 KB read cap. */
export const WEBHOOK_TOTAL_TIMEOUT_MS = 10_000;
export const WEBHOOK_CONNECT_TIMEOUT_MS = 5_000;
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024;

export type PinnedPost = typeof pinnedPost;
export { WEBHOOK_HTTP_CLIENT, WEBHOOK_RESOLVER, WEBHOOK_TEST_ALLOWANCE };

/**
 * The `webhook` action (A2). One attempt = decrypt URL and secret, build the
 * allowlisted payload, sign it, run the SSRF pre-flight (single DNS
 * resolution, every answer checked), then POST to the pinned address with
 * no redirects, a connect and a total timeout, and a 64 KB read cap.
 *
 * Outcomes follow the design doc: 2xx done; 3xx, other 4xx, a blocked URL,
 * a missing or unreadable secret are permanent; DNS failure, timeouts,
 * connection errors, 408, 429 and 5xx are transient (the worker applies the
 * email backoff). Slugs and status codes only reach `last_error` and the
 * log — never the URL, the body, or a secret.
 */
@Injectable()
export class WebhookActionExecutor implements AutomationActionExecutor {
  private readonly logger = new Logger(WebhookActionExecutor.name);
  private readonly ownHosts: readonly string[];
  private readonly allowance: WebhookTestAllowance;
  private readonly resolver: WebhookResolver;
  private readonly http: PinnedPost;

  constructor(
    private readonly secrets: WebhookSecretsService,
    private readonly repo: WebhookPgRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
    @Optional() @Inject(WEBHOOK_RESOLVER) resolver?: WebhookResolver,
    @Optional() @Inject(WEBHOOK_TEST_ALLOWANCE) allowance?: WebhookTestAllowance,
    @Optional() @Inject(WEBHOOK_HTTP_CLIENT) http?: PinnedPost,
  ) {
    this.ownHosts = sealdOwnHosts([
      env.APP_PUBLIC_URL,
      env.SUPABASE_URL,
      env.DATABASE_URL,
      env.CORS_ORIGIN,
    ]);
    this.allowance = effectiveAllowance(env.NODE_ENV, allowance);
    this.resolver = resolver ?? defaultResolver;
    this.http = http ?? pinnedPost;
  }

  async execute(
    job: ClaimedAutomationJob,
    now: Date = new Date(),
  ): Promise<AutomationActionOutcome> {
    const outcome = await this.attempt(job, now);
    if (outcome.kind !== 'done') {
      // Slug and status only: no URL, no body, no secret.
      this.logger.warn(
        `webhook run ${job.run_id} ${outcome.kind} ${outcome.slug}` +
          (outcome.responseStatus ? ` (${outcome.responseStatus})` : ''),
      );
    }
    return outcome;
  }

  private async attempt(job: ClaimedAutomationJob, now: Date): Promise<AutomationActionOutcome> {
    if (job.action !== 'webhook') return { kind: 'permanent', slug: 'bad_config' };

    let url: string;
    let secret: string;
    let previousSecret: string | null;
    try {
      ({ url, secret, previousSecret } = await this.secrets.decrypt(job.automation_id, now));
    } catch (err) {
      if (err instanceof AutomationSecretsNotConfiguredError) {
        return { kind: 'permanent', slug: err.slug };
      }
      if (err instanceof WebhookSecretsMissingError) {
        return { kind: 'permanent', slug: 'webhook_not_configured' };
      }
      if (err instanceof SecretBoxError) {
        return { kind: 'permanent', slug: 'webhook_secret_unreadable' };
      }
      throw err;
    }

    const event = await this.repo.loadEvent({
      envelopeId: job.envelope_id,
      eventId: job.event_id,
      signerId: job.signer_id,
    });
    if (!event) return { kind: 'permanent', slug: 'envelope_missing' };

    const payload = buildWebhookPayload(
      { runId: job.run_id, trigger: job.trigger, ...event },
      payloadDetailFrom(job.config),
      this.env.APP_PUBLIC_URL,
    );
    const rawBody = JSON.stringify(payload);

    const resolved = await resolveWebhookTarget(url, {
      ownHosts: this.ownHosts,
      resolver: this.resolver,
      allowance: this.allowance,
    });
    if (!resolved.ok) {
      return resolved.kind === 'blocked'
        ? { kind: 'permanent', slug: 'webhook_url_blocked' }
        : { kind: 'transient', slug: 'webhook_dns_failed' };
    }

    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': WEBHOOK_USER_AGENT,
      Accept: '*/*',
      ...signatureHeaders({
        secret,
        previousSecret,
        runId: job.run_id,
        timestampSeconds: Math.floor(now.getTime() / 1000),
        rawBody,
      }),
    };

    return this.post(resolved.target, headers, rawBody);
  }

  private async post(
    target: WebhookTarget,
    headers: Record<string, string>,
    body: string,
  ): Promise<AutomationActionOutcome> {
    let res: PinnedPostResult;
    try {
      res = await this.http({
        target,
        headers,
        body,
        connectTimeoutMs: WEBHOOK_CONNECT_TIMEOUT_MS,
        totalTimeoutMs: WEBHOOK_TOTAL_TIMEOUT_MS,
        maxResponseBytes: WEBHOOK_MAX_RESPONSE_BYTES,
      });
    } catch (err) {
      if (err instanceof PinnedRequestError) {
        if (err.slug === 'webhook_address_mismatch') {
          return { kind: 'permanent', slug: 'webhook_url_blocked' };
        }
        return { kind: 'transient', slug: err.slug };
      }
      return { kind: 'transient', slug: 'webhook_connect_failed' };
    }
    return classifyStatus(res);
  }
}

/** Status → outcome (design doc § Execution). Exported for the unit matrix. */
export function classifyStatus(res: PinnedPostResult): AutomationActionOutcome {
  const status = res.status;
  if (status >= 200 && status < 300) return { kind: 'done', responseStatus: status };
  if (status >= 300 && status < 400) {
    return { kind: 'permanent', slug: 'webhook_redirect_blocked', responseStatus: status };
  }
  if (status === 408 || status === 429 || status >= 500) {
    return {
      kind: 'transient',
      slug: `http_${status}`,
      responseStatus: status,
      ...(res.retryAfterMs !== undefined ? { retryAfterMs: res.retryAfterMs } : {}),
    };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'permanent', slug: `http_${status}`, responseStatus: status };
  }
  // 1xx final status or anything unexpected: treat as a temporary failure.
  return status > 0
    ? { kind: 'transient', slug: 'webhook_bad_status', responseStatus: status }
    : { kind: 'transient', slug: 'webhook_bad_status' };
}
