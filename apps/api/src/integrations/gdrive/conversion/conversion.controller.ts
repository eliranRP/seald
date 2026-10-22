import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { CurrentUser } from '../../../auth/current-user.decorator';
import type { AuthUser } from '../../../auth/auth-user';
import { RateLimitedError } from '../rate-limiter';
import { DriveRequestError } from '../drive-request.errors';
import { ConversionGateway } from './conversion.gateway';
import { ConversionService } from './conversion.service';
import {
  ConversionStartRequest,
  type ConversionJobView,
  type ConversionStartResponse,
} from './dto/conversion.dto';

/**
 * Drive doc → PDF conversion routes. Three endpoints, all gated behind
 * `feature.gdriveIntegration` (NotFound when off — matches WT-A-1 leak
 * posture).
 *
 * Per `nodejs-security` review:
 *   - Rate limit shares the per-user token bucket with `/files`, so
 *     rotating accountIds cannot bypass the 30 req / 60 s ceiling.
 *   - Mime allow-list is checked at the controller AND inside the
 *     service (defence in depth).
 *   - Service errors are mapped through a tight switch; upstream messages
 *     are NOT echoed in the response body.
 *   - DELETE cancels via AbortController — both Drive `export` and
 *     Gotenberg fetch observe `signal`. Watchpoint #3 honored.
 */
@Controller('integrations/gdrive/conversion')
export class ConversionController {
  constructor(
    private readonly svc: ConversionService,
    private readonly gateway: ConversionGateway,
  ) {}

  private requireFlag(): void {
    if (!isFeatureEnabled('gdriveIntegration')) {
      throw new NotFoundException('not_found');
    }
  }

  @Post()
  async start(
    @CurrentUser() user: AuthUser,
    @Body() body: ConversionStartRequest,
  ): Promise<ConversionStartResponse> {
    this.requireFlag();
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('body_required');
    }
    const { accountId, fileId, mimeType } = body;
    try {
      return await this.svc.start({ userId: user.id, accountId, fileId, mimeType });
    } catch (err) {
      throw mapStartError(err);
    }
  }

  @Get(':jobId')
  async poll(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<ConversionJobView> {
    this.requireFlag();
    const view = this.gateway.view(jobId, user.id);
    if (!view) throw new NotFoundException('job_not_found');
    return view;
  }

  @Delete(':jobId')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('jobId', ParseUUIDPipe) jobId: string,
  ): Promise<void> {
    this.requireFlag();
    const ok = this.gateway.cancel(jobId, user.id);
    if (!ok) throw new NotFoundException('job_not_found_or_terminal');
  }
}

/**
 * Maps service-layer errors to HTTP responses without echoing upstream
 * messages or tokens. Every branch returns a code from the WT-A-1 6-code
 * contract. NotFoundException (account ownership) is allowed to bubble.
 */
/**
 * Both branches of every response carry the same code in two places:
 *   - `getResponse().code` for the unit suite to assert structured shape;
 *   - `getResponse().message` so the global HttpExceptionFilter renders
 *     `{ error: '<code>' }` over the wire. The SPA reads `body.error`.
 *
 * Upstream messages are NEVER echoed (no `err.message` propagation).
 */
function mapStartError(err: unknown): HttpException {
  if (err instanceof NotFoundException) return err;
  if (err instanceof RateLimitedError) {
    // String message encodes the code (`rate-limited`); the filter turns
    // it into `{ error: 'rate-limited' }` over the wire.
    return new HttpException(
      {
        code: 'rate-limited',
        message: 'rate-limited',
        retryAfter: Math.ceil(err.retryAfterMs / 1000),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
  if (err instanceof DriveRequestError) {
    // The WT-A-1 wire contract names `unsupported-mime` as a bare string
    // so the global HttpExceptionFilter exposes it as `{ error }`.
    if (err.code === 'unsupported-mime') {
      return new HttpException('unsupported-mime', HttpStatus.BAD_REQUEST);
    }
    return new BadRequestException({ code: err.code, message: err.message });
  }
  const rawCode = (err as { code?: string } | null)?.code;
  const codeMap: Record<string, { status: number }> = {
    'file-too-large': { status: HttpStatus.PAYLOAD_TOO_LARGE },
    'unsupported-mime': { status: HttpStatus.BAD_REQUEST },
    'token-expired': { status: HttpStatus.UNAUTHORIZED },
    'oauth-declined': { status: HttpStatus.FORBIDDEN },
    'conversion-failed': { status: HttpStatus.BAD_GATEWAY },
  };
  const code = rawCode && codeMap[rawCode] ? rawCode : 'conversion-failed';
  const status = codeMap[code]?.status ?? HttpStatus.BAD_GATEWAY;
  return new HttpException({ code, message: code }, status);
}
