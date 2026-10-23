import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { Public } from '../../../auth/public.decorator';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import { automationsActive } from '../../matcher';
import { hashStopToken, looksLikeStopToken } from './email-copy.config';
import { EmailCopyRepository } from './email-copy.repository';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{font-family:system-ui,sans-serif;background:#f8fafc;color:#0b1220;margin:0;padding:48px 16px}
main{max-width:460px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:28px}
h1{font-size:20px;margin:0 0 12px}p{line-height:1.5;color:#334155}
button{background:#0b1220;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:14px;font-weight:600;cursor:pointer}</style>
</head><body><main>${inner}</main></body></html>`;
}

/**
 * Public stop link behind `automation_copy` mail (design doc § Email copy).
 * No session: the single-use token in the link is the credential. A GET
 * only shows a confirmation page, so a mail scanner that prefetches the
 * link cannot stop anything; the button POSTs the token and does the work.
 * An unknown or spent token and a dark feature are the same 404 / generic
 * page. Responses are never cached and send no referrer.
 */
@Public()
@Controller('automations/stop')
export class EmailCopyStopController {
  constructor(
    private readonly repo: EmailCopyRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  @Get()
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  async confirm(@Query('t') token: unknown, @Res() res: Response): Promise<void> {
    this.guard();
    this.headers(res);
    const found = looksLikeStopToken(token)
      ? await this.repo.peekStopToken(hashStopToken(token))
      : null;
    if (!found || !looksLikeStopToken(token)) {
      res.status(404).type('html').send(this.invalidPage());
      return;
    }
    res
      .status(200)
      .type('html')
      .send(
        page(
          'Stop these notices',
          `<h1>Stop these notices?</h1><p>Seald will stop sending automation notices to <strong>${esc(found.email)}</strong>. Other addresses are not affected.</p>` +
            `<form method="post" action="/automations/stop"><input type="hidden" name="t" value="${esc(token)}"><button type="submit">Stop these notices</button></form>`,
        ),
      );
  }

  @Post()
  @HttpCode(200)
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  async stop(@Body() body: unknown, @Res() res: Response): Promise<void> {
    this.guard();
    this.headers(res);
    const token = (body as { t?: unknown } | null | undefined)?.t;
    if (!looksLikeStopToken(token)) {
      res.status(404).type('html').send(this.invalidPage());
      return;
    }
    const result = await this.repo.consumeStopToken(hashStopToken(token));
    if (result.kind === 'invalid') {
      res.status(404).type('html').send(this.invalidPage());
      return;
    }
    res
      .status(200)
      .type('html')
      .send(
        page(
          'Notices stopped',
          `<h1>Done</h1><p>Seald will no longer send automation notices to <strong>${esc(result.email)}</strong>.</p>`,
        ),
      );
  }

  private guard(): void {
    if (!automationsActive(this.env)) throw new NotFoundException('not_found');
  }

  private headers(res: Response): void {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
    );
  }

  private invalidPage(): string {
    return page(
      'Link not valid',
      '<h1>This link is not valid</h1><p>It may already have been used. Nothing was changed.</p>',
    );
  }
}
