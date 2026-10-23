import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Every response carries an id support can search the logs for; 5xx
    // bodies also echo it as `request_id` so the web app can show it.
    const header = request.headers?.['x-request-id'];
    const requestId =
      typeof header === 'string' && /^[A-Za-z0-9._-]{8,64}$/.test(header) ? header : randomUUID();
    response.setHeader('x-request-id', requestId);

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const raw =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? 'error');
      // `reason`, `waiting_on`, `sender_name`, `signed_at` and `short_code` are additive machine hints (signer link
      // states); no other body field is passed through. 5xx bodies also echo the request id.
      const extra = typeof body === 'string' ? {} : (body as Record<string, unknown>);
      const normalized = {
        error: Array.isArray(raw) ? raw.join('; ') : raw,
        ...(typeof extra['reason'] === 'string' ? { reason: extra['reason'] } : {}),
        ...(typeof extra['waiting_on'] === 'string' ? { waiting_on: extra['waiting_on'] } : {}),
        ...(typeof extra['sender_name'] === 'string' ? { sender_name: extra['sender_name'] } : {}),
        ...(typeof extra['signed_at'] === 'string' ? { signed_at: extra['signed_at'] } : {}),
        ...(typeof extra['short_code'] === 'string' ? { short_code: extra['short_code'] } : {}),
        ...(status >= 500 ? { request_id: requestId } : {}),
      };
      response.status(status).json(normalized);
      return;
    }

    this.logger.error(
      `Unhandled exception on ${request.method} ${request.url} (request_id=${requestId})`,
      exception instanceof Error ? exception.stack : String(exception),
    );
    response.status(500).json({ error: 'internal_error', request_id: requestId });
  }
}
