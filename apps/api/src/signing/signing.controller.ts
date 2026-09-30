import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { serialize as serializeCookie } from 'cookie';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { EnvelopeField, EnvelopeSigner } from '../envelopes/envelopes.repository';
import { DeclineDto } from './dto/decline.dto';
import { EsignDisclosureDto } from './dto/esign-disclosure.dto';
import { FillFieldDto } from './dto/fill-field.dto';
import { SignatureMetaDto } from './dto/signature-meta.dto';
import { StartSessionDto } from './dto/start-session.dto';
import { SignerSession } from './signer-session.decorator';
import { SignerSessionGuard, type SignerSessionContext } from './signer-session.guard';
import { SIGNER_SESSION_COOKIE, SignerSessionService } from './signer-session.service';
import { SigningService, type SignMeResponse } from './signing.service';

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
@Public()
@Controller('sign')
export class SigningController {
  constructor(
    private readonly svc: SigningService,
    private readonly session: SignerSessionService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Post('start')
  // Tight per-route rate limit on the unauthenticated token-exchange
  // endpoint: 3 attempts per minute per IP. Prevents token-burning brute
  // force while still allowing a signer to retry after a typo.
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
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

  @Get('me')
  @UseGuards(SignerSessionGuard)
  me(@SignerSession() session: SignerSessionContext): SignMeResponse {
    return this.svc.me(session.envelope, session.signer);
  }

  @Get('pdf')
  @UseGuards(SignerSessionGuard)
  async pdf(@SignerSession() session: SignerSessionContext): Promise<{ readonly url: string }> {
    // Return the signed URL as JSON rather than 302-redirecting. pdf.js
    // fetches the document with `withCredentials: true` so it can carry
    // the signer-session cookie to /sign/pdf; but Supabase's storage
    // signed-URL endpoint does NOT return `Access-Control-Allow-
    // Credentials: true`, so a browser-followed redirect aborts as CORS.
    // Handing the URL to the client lets it fetch the PDF in a fresh
    // no-credentials request — the signed URL already encodes auth.
    const url = await this.svc.getOriginalPdfSignedUrl(session.envelope);
    return { url };
  }

  @Post('accept-terms')
  @UseGuards(SignerSessionGuard)
  @HttpCode(204)
  async acceptTerms(
    @SignerSession() session: SignerSessionContext,
    @Req() req: Request,
  ): Promise<void> {
    const ip = extractClientIp(req);
    const ua = req.headers['user-agent'] ?? null;
    await this.svc.acceptTerms(session.envelope, session.signer, ip, ua);
  }

  /**
   * T-14 — record the ESIGN Consumer Disclosure acknowledgment. The
   * caller passes the disclosure version they were shown so we can
   * later prove which version applied. The version is also baked into
   * the audit chain metadata.
   */
  @Post('esign-disclosure')
  @UseGuards(SignerSessionGuard)
  @HttpCode(204)
  async esignDisclosure(
    @SignerSession() session: SignerSessionContext,
    @Body() dto: EsignDisclosureDto,
    @Req() req: Request,
  ): Promise<void> {
    const ip = extractClientIp(req);
    const ua = req.headers['user-agent'] ?? null;
    await this.svc.acknowledgeEsignDisclosure(
      session.envelope,
      session.signer,
      dto.disclosure_version,
      ip,
      ua,
    );
  }

  /**
   * T-15 — record the signer's explicit intent-to-sign affirmation.
   * No body — the act of POSTing is the affirmation. Called by the
   * Review screen when the dedicated checkbox is ticked.
   */
  @Post('intent-to-sign')
  @UseGuards(SignerSessionGuard)
  @HttpCode(204)
  async intentToSign(
    @SignerSession() session: SignerSessionContext,
    @Req() req: Request,
  ): Promise<void> {
    const ip = extractClientIp(req);
    const ua = req.headers['user-agent'] ?? null;
    await this.svc.confirmIntentToSign(session.envelope, session.signer, ip, ua);
  }

  /**
   * T-16 — record the signer withdrawing consent for electronic
   * signing. Distinct from /sign/decline: emits a discrete event then
   * funnels into the decline pipeline (which is the only terminal
   * channel since Seald is electronic-only). Clears the session
   * cookie like /sign/decline.
   */
  @Post('withdraw-consent')
  @UseGuards(SignerSessionGuard)
  @HttpCode(200)
  async withdrawConsent(
    @SignerSession() session: SignerSessionContext,
    @Body() dto: DeclineDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'declined'; envelope_status: string }> {
    const result = await this.svc.withdrawConsent(
      session.envelope,
      session.signer,
      dto.reason ?? null,
      extractClientIp(req),
      req.headers['user-agent'] ?? null,
    );
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SIGNER_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.env.NODE_ENV === 'production',
        path: '/sign',
        maxAge: 0,
      }),
    );
    return result;
  }

  @Post('fields/:field_id')
  @UseGuards(SignerSessionGuard)
  @HttpCode(200)
  async fillField(
    @SignerSession() session: SignerSessionContext,
    @Param('field_id', ParseUUIDPipe) field_id: string,
    @Body() dto: FillFieldDto,
    @Req() req: Request,
  ): Promise<EnvelopeField> {
    return this.svc.fillField(
      session.envelope,
      session.signer,
      field_id,
      {
        ...(dto.value_text !== undefined ? { value_text: dto.value_text } : {}),
        ...(dto.value_boolean !== undefined ? { value_boolean: dto.value_boolean } : {}),
      },
      extractClientIp(req),
      req.headers['user-agent'] ?? null,
    );
  }

  @Post('submit')
  @UseGuards(SignerSessionGuard)
  @HttpCode(200)
  async submit(
    @SignerSession() session: SignerSessionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'submitted'; envelope_status: string }> {
    const result = await this.svc.submit(
      session.envelope,
      session.signer,
      extractClientIp(req),
      req.headers['user-agent'] ?? null,
    );
    // Clear the session cookie — the session is no longer usable since the
    // signer has submitted. Any subsequent /sign/* call 401s.
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SIGNER_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.env.NODE_ENV === 'production',
        path: '/sign',
        maxAge: 0,
      }),
    );
    return result;
  }

  @Post('decline')
  @UseGuards(SignerSessionGuard)
  @HttpCode(200)
  async decline(
    @SignerSession() session: SignerSessionContext,
    @Body() dto: DeclineDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ status: 'declined'; envelope_status: string }> {
    const result = await this.svc.decline(
      session.envelope,
      session.signer,
      dto.reason ?? null,
      extractClientIp(req),
      req.headers['user-agent'] ?? null,
    );
    // Clear session cookie — envelope is terminal, every /sign/* now 401/410s.
    res.setHeader(
      'Set-Cookie',
      serializeCookie(SIGNER_SESSION_COOKIE, '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.env.NODE_ENV === 'production',
        path: '/sign',
        maxAge: 0,
      }),
    );
    return result;
  }

  @Post('signature')
  @UseGuards(SignerSessionGuard)
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('image', {
      // 1 MB hard cap at middleware; service enforces 512 KB with a proper slug.
      limits: { fileSize: 1 * 1024 * 1024, files: 1 },
    }),
  )
  async signature(
    @SignerSession() session: SignerSessionContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() meta: SignatureMetaDto,
  ): Promise<EnvelopeSigner> {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('image_unreadable');
    }
    return this.svc.setSignature(session.envelope, session.signer, file.buffer, {
      kind: meta.kind ?? 'signature',
      format: meta.format,
      font: meta.font ?? null,
      stroke_count: meta.stroke_count ?? null,
      source_filename: meta.source_filename ?? null,
    });
  }
}
