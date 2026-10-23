import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { ClaimDirectLinkResult, PublicDirectLink } from 'shared';
import { Public } from '../auth/public.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import { ClaimDirectLinkDto } from './dto/direct-link.dto';
import { DirectLinksFlagGuard } from './direct-links-owner.controller';
import { DirectLinkThrottledException, DirectLinksService } from './direct-links.service';

/**
 * WP-37 public routes behind the SPA's `/d/:token` page. No session: the
 * token in the path is the only credential, and it grants one thing, a new
 * envelope for whoever proves an email address. Every unusable token (bad
 * shape, unknown, disabled, rotated away, template gone) is the same 404.
 * Rate limited per IP and per link in the service, and per IP again here
 * by the global throttler. 404 while `directLinks` is off.
 */
@Public()
@Controller('direct-links')
@UseGuards(DirectLinksFlagGuard)
export class DirectLinksPublicController {
  constructor(private readonly svc: DirectLinksService) {}

  @Get(':token')
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  async view(
    @Param('token') token: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicDirectLink> {
    noStore(res);
    return this.guarded(res, () => this.svc.publicView(token, extractClientIp(req)));
  }

  @Post(':token/claim')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  async claim(
    @Param('token') token: string,
    @Body() dto: ClaimDirectLinkDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClaimDirectLinkResult> {
    noStore(res);
    return this.guarded(res, () =>
      this.svc.claim(
        token,
        { name: dto.name, email: dto.email },
        { ip: extractClientIp(req), user_agent: req.headers['user-agent'] ?? null },
      ),
    );
  }

  private async guarded<T>(res: Response, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (err instanceof DirectLinkThrottledException) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
}
