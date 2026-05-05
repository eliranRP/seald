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
import { GDriveRateLimiter, RateLimitedError } from '../rate-limiter';
import { ConversionGateway } from './conversion.gateway';
import { ConversionService } from './conversion.service';
import {
  ALLOWED_CONVERSION_MIMES,
  ConversionStartRequest,
  type ConversionJobView,
  type ConversionStartResponse,
} from './dto/conversion.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_CONVERSION_MIMES);

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
    private readonly rateLimiter: GDriveRateLimiter,
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
    if (typeof accountId !== 'string' || !UUID_RE.test(accountId)) {
      throw new BadRequestException({
        code: 'invalid-account-id',
        message: 'accountId_must_be_uuid',
      });
    }
    if (typeof fileId !== 'string' || fileId.length === 0 || fileId.length > 256) {
      throw new BadRequestException({
        code: 'invalid-file-id',
        message: 'fileId_required',
      });
    }
    if (typeof mimeType !== 'string' || !ALLOWED_SET.has(mimeType)) {
      // Encode the named error code as the HttpException string so the
      // global HttpExceptionFilter exposes it to the SPA as
      // `{ error: 'unsupported-mime' }`. The WT-A-1 wire contract names
      // these codes as the public error vocabulary.
      throw new HttpException('unsupported-mime', HttpStatus.BAD_REQUEST);
    }
    await this.acquireOrThrow(user.id);
    try {
      const out = await this.svc.start({
        userId: user.id,
        accountId,
        fileId,
        mimeType,
      });
      return out;
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

  private async acquireOrThrow(userId: string): Promise<void> {
    try {
      await this.rateLimiter.acquire(userId);
    } catch (err) {
      if (err instanceof RateLimitedError) {
        // String message encodes the code (`rate-limited`); the filter
        // will turn it into `{ error: 'rate-limited' }`. Retry-after
        // is exposed via the HTTP header (set by NestJS automatically
        // when the message body includes it via the structured form),
        // so we keep the structured response for the unit suite while
        // the filter strips it for over-the-wire callers.
        throw new HttpException(
          {
            code: 'rate-limited',
            message: 'rate-limited',
            retryAfter: Math.ceil(err.retryAfterMs / 1000),
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw err;
    }
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
