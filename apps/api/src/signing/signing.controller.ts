import { Body, Controller, HttpCode, Inject, Post, Res } from '@nestjs/common';
import { serialize as serializeCookie } from 'cookie';
import type { Response } from 'express';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { StartSessionDto } from './dto/start-session.dto';
import { SIGNER_SESSION_COOKIE, SignerSessionService } from './signer-session.service';
import { SigningService } from './signing.service';

/**
 * Signer-facing HTTP surface. Routes under `/sign` operate either with:
 *   - no session (POST /sign/start — exchanges opaque token for cookie)
 *   - a session cookie `seald_sign` (every other /sign/* route, guarded
 *     by SignerSessionGuard in subsequent tasks).
 *
 * CORS for these routes runs from `seald.nromomentum.com` (the signer-facing
 * web app) against `api.seald.nromomentum.com` — main.ts's enableCors already
 * honors `CORS_ORIGIN`, no per-route config needed.
 */
@Controller('sign')
export class SigningController {
  constructor(
    private readonly svc: SigningService,
    private readonly session: SignerSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('start')
  @HttpCode(200)
  async start(
    @Body() dto: StartSessionDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ envelope_id: string; signer_id: string; requires_tc_accept: boolean }> {
    const result = await this.svc.startSession(dto.envelope_id, dto.token);

    // HttpOnly cookie. SameSite=Lax so the email-link top-level navigation
    // includes it on subsequent fetches; Secure in production but omitted in
    // test/dev so plain-HTTP localhost testing works (cookie is rejected by
    // browsers when Secure is set on insecure origins).
    const secure = this.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SIGNER_SESSION_COOKIE, result.session_jwt, {
        httpOnly: true,
        sameSite: 'lax',
        secure,
        path: '/sign',
        maxAge: this.session.cookieMaxAgeSeconds,
      }),
    );

    return {
      envelope_id: result.envelope_id,
      signer_id: result.signer_id,
      requires_tc_accept: result.requires_tc_accept,
    };
  }
}
