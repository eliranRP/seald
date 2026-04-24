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
import { serialize as serializeCookie } from 'cookie';
import type { Request, Response } from 'express';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import type { EnvelopeField, EnvelopeSigner } from '../envelopes/envelopes.repository';
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

  @Get('me')
  @UseGuards(SignerSessionGuard)
  me(@SignerSession() session: SignerSessionContext): SignMeResponse {
    return this.svc.me(session.envelope, session.signer);
  }

  @Get('pdf')
  @UseGuards(SignerSessionGuard)
  async pdf(
    @SignerSession() session: SignerSessionContext,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const url = await this.svc.getOriginalPdfSignedUrl(session.envelope);
    res.redirect(302, url);
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
      format: meta.format,
      font: meta.font ?? null,
      stroke_count: meta.stroke_count ?? null,
      source_filename: meta.source_filename ?? null,
    });
  }
}

function extractClientIp(req: Request): string | null {
  // X-Forwarded-For is set by Caddy in prod; socket.remoteAddress is the
  // raw peer in dev. We trust the first entry since the proxy is ours.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket?.remoteAddress ?? null;
}
