import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import type { Observable } from 'rxjs';

/**
 * Headers on every approval API response (docs/design/mcp-server.md
 * § Owner approval): never cached, no referrer, never framed. Set before
 * the handler runs so error responses carry them too; they replace the
 * helmet defaults (`SAMEORIGIN`) rather than adding a second value.
 */
@Injectable()
export class ApprovalResponseHeadersInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    res.setHeader('X-Robots-Tag', 'noindex');
    return next.handle();
  }
}
