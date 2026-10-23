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
      const message = Array.isArray(raw) ? raw.join('; ') : raw;
      const normalized =
        status >= 500 ? { error: message, request_id: requestId } : { error: message };
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
