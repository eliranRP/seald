import { Inject, Injectable, Optional } from '@nestjs/common';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import {
  checkWebhookUrl,
  effectiveAllowance,
  sealdOwnHosts,
  type WebhookTestAllowance,
} from '../../ssrf/webhook-target';
import {
  SecretBox,
  generateWebhookSecret,
  parseAutomationSecretsKey,
  secretAad,
  urlAad,
} from './secret-box';
import { WebhookPgRepository } from './webhook.repository.pg';
import { WEBHOOK_TEST_ALLOWANCE } from './webhook.tokens';

/** Previous secret keeps verifying for this long after a rotation. */
export const ROTATION_OVERLAP_MS = 24 * 60 * 60_000;

/** 503 slug when `AUTOMATION_SECRETS_KEY` is unset (design doc § Data model). */
export const AUTOMATION_SECRETS_NOT_CONFIGURED = 'automation_secrets_not_configured';

export class AutomationSecretsNotConfiguredError extends Error {
  readonly slug = AUTOMATION_SECRETS_NOT_CONFIGURED;
  constructor() {
    super(AUTOMATION_SECRETS_NOT_CONFIGURED);
    this.name = 'AutomationSecretsNotConfiguredError';
  }
}

/** The URL failed the static SSRF checks. `reason` is a slug, never the URL. */
export class WebhookUrlRejectedError extends Error {
  readonly slug = 'webhook_url_blocked';
  constructor(readonly reason: string) {
    super('webhook_url_blocked');
    this.name = 'WebhookUrlRejectedError';
  }
}

export class WebhookSecretsMissingError extends Error {
  constructor() {
    super('webhook_not_configured');
    this.name = 'WebhookSecretsMissingError';
  }
}

export interface DecryptedWebhookSecrets {
  readonly url: string;
  readonly secret: string;
  /** Set only while the rotated-out secret is inside its 24-hour window. */
  readonly previousSecret: string | null;
}

export interface CreatedWebhookSecret {
  /** Shown to the owner once. Never stored in plaintext or logged. */
  readonly secret: string;
  /** Hostname only, for `config.url_host`. */
  readonly urlHost: string;
}

/**
 * Owns the plaintext side of webhook secrets: generates the signing secret
 * server side, encrypts it and the URL before they reach the database, and
 * decrypts them for the worker. The create/rotate/replace methods are the
 * service seam the automations API (WP-30 / A3) and the settings page call;
 * they return the secret once and never echo the URL.
 */
@Injectable()
export class WebhookSecretsService {
  private readonly box: SecretBox | null;
  private readonly ownHosts: readonly string[];
  private readonly allowance: WebhookTestAllowance;

  constructor(
    private readonly repo: WebhookPgRepository,
    @Inject(APP_ENV) env: AppEnv,
    @Optional() @Inject(WEBHOOK_TEST_ALLOWANCE) allowance?: WebhookTestAllowance,
  ) {
    this.allowance = effectiveAllowance(env.NODE_ENV, allowance);
    const key = parseAutomationSecretsKey(env.AUTOMATION_SECRETS_KEY);
    this.box = key ? new SecretBox(key) : null;
    this.ownHosts = sealdOwnHosts([
      env.APP_PUBLIC_URL,
      env.SUPABASE_URL,
      env.DATABASE_URL,
      env.CORS_ORIGIN,
    ]);
  }

  isConfigured(): boolean {
    return this.box !== null;
  }

  private requireBox(): SecretBox {
    if (!this.box) throw new AutomationSecretsNotConfiguredError();
    return this.box;
  }

  /**
   * Static URL check for create/update (scheme, userinfo, port, internal and
   * Seald hostnames, blocked IP literals). DNS is checked again on every
   * attempt by the worker. Returns the hostname for `config.url_host`.
   */
  validateUrl(url: string): string {
    const checked = checkWebhookUrl(url, { ownHosts: this.ownHosts, allowance: this.allowance });
    if (!checked.ok) throw new WebhookUrlRejectedError(checked.reason);
    return checked.hostname;
  }

  /** New recipe: generate the signing secret, store secret + URL encrypted. */
  async createSecrets(automationId: string, url: string): Promise<CreatedWebhookSecret> {
    const box = this.requireBox();
    const urlHost = this.validateUrl(url);
    const secret = generateWebhookSecret();
    await this.repo.putSecrets(
      automationId,
      box.seal(secret, secretAad(automationId)),
      box.seal(url, urlAad(automationId)),
    );
    return { secret, urlHost };
  }

  /** Replace the URL, keep the secret. Returns the new `url_host`. */
  async replaceUrl(automationId: string, url: string): Promise<string> {
    const box = this.requireBox();
    const urlHost = this.validateUrl(url);
    const ok = await this.repo.replaceUrl(automationId, box.seal(url, urlAad(automationId)));
    if (!ok) throw new WebhookSecretsMissingError();
    return urlHost;
  }

  /** Rotate: new secret shown once; the old one verifies for 24 hours. */
  async rotateSecret(
    automationId: string,
    now: Date = new Date(),
  ): Promise<{ readonly secret: string; readonly previousRetiresAt: Date }> {
    const box = this.requireBox();
    const secret = generateWebhookSecret();
    const previousRetiresAt = new Date(now.getTime() + ROTATION_OVERLAP_MS);
    const ok = await this.repo.rotateSecret(
      automationId,
      box.seal(secret, secretAad(automationId)),
      previousRetiresAt,
    );
    if (!ok) throw new WebhookSecretsMissingError();
    return { secret, previousRetiresAt };
  }

  /** For the worker. Throws `SecretBoxError` on a tampered or foreign row. */
  async decrypt(automationId: string, now: Date): Promise<DecryptedWebhookSecrets> {
    const box = this.requireBox();
    const row = await this.repo.getSecrets(automationId);
    if (!row) throw new WebhookSecretsMissingError();
    const aad = secretAad(automationId);
    const previousLive =
      row.previous !== null &&
      row.previousRetiredAt !== null &&
      row.previousRetiredAt.getTime() > now.getTime();
    return {
      url: box.open(row.url, urlAad(automationId)),
      secret: box.open(row.secret, aad),
      previousSecret: previousLive && row.previous ? box.open(row.previous, aad) : null,
    };
  }

  /** Daily pass from the worker. */
  clearRetiredPrevious(now: Date): Promise<number> {
    return this.repo.clearRetiredPrevious(now);
  }
}
