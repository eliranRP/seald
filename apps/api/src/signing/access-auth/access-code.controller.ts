import { Body, Controller, HttpCode, Inject, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { serialize as serializeCookie } from 'cookie';
import type { Request, Response } from 'express';
import type { AccessCodeSendResponse } from 'shared';
import { Public } from '../../auth/public.decorator';
import { extractClientIp } from '../../common/extract-client-ip';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { SignerSession } from '../signer-session.decorator';
import type { SignerSessionContext } from '../signer-session.guard';
import { SIGNER_SESSION_COOKIE, SignerSessionService } from '../signer-session.service';
import { AccessAuthService, AccessCodeThrottledException } from './access-auth.service';
import { AccessCodeSessionGuard } from './access-code-session.guard';
import {
  ACCESS_PENDING_COOKIE,
  ACCESS_PENDING_COOKIE_PATH,
} from './access-pending-session.service';
import { SendAccessCodeDto, VerifyAccessCodeDto } from './dto/access-code.dto';

/**
 * Signer-facing access-code routes (WP-10, flag `signerAccessAuth`; 404
 * while it is off).
 *
 *   POST /sign/access-code/send    email a code (pending cookie; or a full
 *                                  session with `purpose: 'action'`)
 *   POST /sign/access-code/verify  check the code, then issue the signer
 *                                  session exactly like /sign/start does
 *
 * Both are IP rate limited on top of the per-signer limits the service
 * enforces in the database.
 */
@Public()
@Controller('sign/access-code')
@UseGuards(AccessCodeSessionGuard)
export class AccessCodeController {
  constructor(
    private readonly svc: AccessAuthService,
    private readonly session: SignerSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('send')
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
  @HttpCode(200)
  async send(
    @SignerSession() ctx: SignerSessionContext,
    @Body() dto: SendAccessCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessCodeSendResponse> {
    try {
      return await this.svc.sendCode(
        ctx.envelope,
        ctx.signer,
        dto.purpose ?? 'access',
        extractClientIp(req),
        req.headers['user-agent'] ?? null,
      );
    } catch (err) {
      if (err instanceof AccessCodeThrottledException) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }

  @Post('verify')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  @HttpCode(200)
  async verify(
    @SignerSession() ctx: SignerSessionContext,
    @Body() dto: VerifyAccessCodeDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ envelope_id: string; signer_id: string; requires_tc_accept: boolean }> {
    await this.svc.verifyCode(
      ctx.envelope,
      ctx.signer,
      'access',
      dto.code,
      extractClientIp(req),
      req.headers['user-agent'] ?? null,
    );
    const jwt = await this.session.mint({
      envelope_id: ctx.envelope.id,
      signer_id: ctx.signer.id,
    });
    const secure = this.env.NODE_ENV === 'production';
    res.setHeader('Set-Cookie', [
      serializeCookie(SIGNER_SESSION_COOKIE, jwt, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/sign',
        maxAge: this.session.cookieMaxAgeSeconds,
      }),
      clearPendingCookie(secure),
    ]);
    return { envelope_id: ctx.envelope.id, signer_id: ctx.signer.id, requires_tc_accept: true };
  }
}

/** The pending cookie `/sign/start` sets when a code is required. */
export function pendingCookie(jwt: string, secure: boolean, maxAge: number): string {
  return serializeCookie(ACCESS_PENDING_COOKIE, jwt, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: ACCESS_PENDING_COOKIE_PATH,
    maxAge,
  });
}

export function clearPendingCookie(secure: boolean): string {
  return pendingCookie('', secure, 0);
}
