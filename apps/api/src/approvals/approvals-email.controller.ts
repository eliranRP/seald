import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  Post,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { parse as parseCookies, serialize as serializeCookie } from 'cookie';
import type { Request, Response } from 'express';
import {
  ApprovalEmailDecisionRequestSchema,
  ApprovalEmailPreviewRequestSchema,
  type ApprovalCard,
} from 'shared';
import { Public } from '../auth/public.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import { ApprovalCsrf } from './approval-csrf';
import { ApprovalRateLimiter } from './approval-rate-limiter';
import { ApprovalResponseHeadersInterceptor } from './approval-response-headers.interceptor';
import { hashApprovalToken } from './approval-token';
import { decisionAudit } from './approvals.controller';
import { ApprovalsService } from './approvals.service';

const CSRF_COOKIE_MAX_AGE_SECONDS = 60 * 60;

/**
 * The API behind the public `/approve` page (docs/design/mcp-server.md
 * § Owner approval, step 7a). The link is `/approve#<token>`: the token
 * travels only in the fragment and in these POST bodies, never in a path
 * or a query, so access logs and scanners do not see it.
 *
 * - `POST /approvals/from-email/preview` returns the card and, for a link
 *   that can still decide, the CSRF value in the body and its nonce in a
 *   `__Host-` cookie. It never decides, so mail prefetch cannot approve.
 * - `POST /approvals/from-email` is Approve or Deny. It needs the token,
 *   the CSRF value bound to that approval, the cookie and the app Origin;
 *   anything missing is `csrf_invalid` and decides nothing. Deny never
 *   needs a session. Approve answers `session_required` when the
 *   recomputed rule needs one: the page then sends the owner to the
 *   signed-in review, which approves through `POST /approvals/:id/approve`.
 *
 * `@Public()`: no Supabase session on this path. Flood limits per IP and
 * per token. `ApiKeysFlagMiddleware` 404s both routes while the feature
 * is dark.
 */
@Public()
@Controller('approvals/from-email')
@UseInterceptors(ApprovalResponseHeadersInterceptor)
export class ApprovalsEmailController {
  constructor(
    private readonly svc: ApprovalsService,
    private readonly csrf: ApprovalCsrf,
    private readonly flood: ApprovalRateLimiter,
  ) {}

  @Post('preview')
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async preview(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApprovalCard> {
    const parsed = ApprovalEmailPreviewRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    this.flood.check([
      `ip:${extractClientIp(req) ?? 'unknown'}`,
      `token:${hashApprovalToken(parsed.data.token)}`,
    ]);
    const { card, csrfNonce } = await this.svc.previewFromEmail(parsed.data.token);
    if (csrfNonce) {
      res.setHeader(
        'Set-Cookie',
        serializeCookie(this.csrf.cookieName, csrfNonce, {
          httpOnly: true,
          secure: this.csrf.secureCookie,
          sameSite: 'strict',
          path: '/',
          maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
        }),
      );
    }
    return card;
  }

  @Post()
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  decide(@Body() body: unknown, @Req() req: Request): Promise<ApprovalCard> {
    const parsed = ApprovalEmailDecisionRequestSchema.safeParse(body ?? {});
    // A body without the CSRF field is csrf_invalid, the same as a wrong one.
    if (!parsed.success) {
      const csrfMissing =
        typeof body === 'object' && body !== null && !('csrf' in (body as Record<string, unknown>));
      if (csrfMissing) throw new ForbiddenException('csrf_invalid');
      throw new BadRequestException('validation_error');
    }
    this.flood.check([
      `ip:${extractClientIp(req) ?? 'unknown'}`,
      `token:${hashApprovalToken(parsed.data.token)}`,
    ]);
    const cookieHeader = req.headers['cookie'];
    const jar = typeof cookieHeader === 'string' ? parseCookies(cookieHeader) : {};
    const origin = req.headers['origin'];
    return this.svc.decideFromEmail({
      token: parsed.data.token,
      decision: parsed.data.decision,
      csrf: parsed.data.csrf,
      csrfNonce: jar[this.csrf.cookieName],
      origin: typeof origin === 'string' ? origin : undefined,
      audit: decisionAudit(req),
    });
  }
}
