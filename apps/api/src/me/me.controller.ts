import { Body, Controller, Delete, Get, HttpCode, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { MeService } from './me.service';

/**
 * T-19 (`GET /me/export`) and T-20 (`DELETE /me`) — DSAR / right-to-
 * erasure surface required for GDPR Art. 15 / Art. 17 and CCPA §1798.105.
 * Both endpoints sit behind the global `AuthGuard`. The throttle limits
 * are tight because both are heavy: export hydrates the user's full
 * aggregate and delete is irreversible.
 */
@Controller('me')
export class MeController {
  constructor(private readonly svc: MeService) {}

  @Get('export')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  async exportAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const filename = `seald-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // RFC 6266 / RFC 5987 Content-Disposition (issue #44 defense-in-
    // depth). The `sub` claim is already UUID-validated at the JWT
    // strategy boundary so the interpolation is safe today, but we
    // still emit `filename*=UTF-8''<encoded>` so a regression in the
    // validator can't reopen the header-injection vector.
    res.setHeader('Content-Disposition', buildContentDisposition(filename));
    // Don't let any caching layer keep the user's data.
    res.setHeader('Cache-Control', 'no-store');

    // Issue #45 — stream envelopes in batches instead of materializing
    // the whole aggregate. Peak heap is bounded by one batch
    // (~5 MB at default settings), independent of how many envelopes the
    // caller owns. Backpressure is honored automatically because the
    // service uses an async generator behind `Readable.from`.
    const stream = await this.svc.exportAllStream(user);
    stream.on('error', (err) => {
      // Once headers are flushed we can't change the status code; the
      // safest signal to the client is to abort the connection. The
      // truncated JSON will fail to parse and they will retry.
      res.destroy(err);
    });
    stream.pipe(res);
  }

  @Delete()
  @HttpCode(204)
  @Throttle({ short: { limit: 1, ttl: 60_000 }, long: { limit: 5, ttl: 3_600_000 } })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() _dto: DeleteAccountDto,
  ): Promise<void> {
    // The DTO already validated the confirm phrase (`@Equals(...)`); we
    // discard it here and only forward the user identity. If the
    // confirm field is wrong, validation throws 400 before we get
    // called.
    await this.svc.deleteAccount(user);
  }
}

/**
 * Build an RFC 6266 `Content-Disposition` value with both an ASCII
 * `filename=` parameter (quoted, with any `\` and `"` escaped) and an
 * RFC 5987 `filename*=UTF-8''<percent-encoded>` extension. Modern
 * browsers prefer `filename*` and ignore the ASCII fallback. By
 * percent-encoding the entire filename via `encodeURIComponent` we
 * guarantee no quote, semicolon, CR, or LF can ever escape the header
 * value — closing the issue #44 injection vector at the response layer
 * regardless of upstream validation.
 */
export function buildContentDisposition(filename: string): string {
  // ASCII fallback: strip non-ASCII, escape backslash + double-quote.
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/[\\"]/g, '\\$&');
  // RFC 5987: percent-encode everything outside the attr-char set. The
  // built-in `encodeURIComponent` is a strict superset of attr-char
  // safety (it escapes `,`, `;`, `=`, `*`, etc. that RFC 5987 reserves).
  const utf8 = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}
