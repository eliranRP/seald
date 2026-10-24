import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../auth/public.decorator';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { ResendWebhookService, type ResendWebhookOutcome } from './resend-webhook.service';
import { verifySvixSignature } from './svix-signature';

/**
 * Resend delivery webhooks. Public by necessity (Resend calls it), so the
 * only gate is the Svix signature over the raw body with
 * `RESEND_WEBHOOK_SECRET`. Unset secret: 503, the route does nothing.
 */
@Public()
@SkipThrottle({ short: true, medium: true, long: true })
@Controller('webhooks')
export class ResendWebhookController {
  constructor(
    private readonly service: ResendWebhookService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('resend')
  @HttpCode(200)
  async resend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
  ): Promise<{ readonly ok: true; readonly outcome: ResendWebhookOutcome }> {
    const secret = this.env.RESEND_WEBHOOK_SECRET;
    if (!secret) throw new ServiceUnavailableException('webhook_not_configured');
    const raw = req.rawBody?.toString('utf8');
    if (raw === undefined) throw new BadRequestException('raw_body_unavailable');
    if (!verifySvixSignature(secret, raw, { id, timestamp, signature })) {
      throw new UnauthorizedException('invalid_signature');
    }
    let event: unknown;
    try {
      event = JSON.parse(raw);
    } catch {
      throw new BadRequestException('invalid_json');
    }
    if (typeof event !== 'object' || event === null) throw new BadRequestException('invalid_json');
    const outcome = await this.service.handle(event as Record<string, unknown>);
    return { ok: true, outcome };
  }
}
