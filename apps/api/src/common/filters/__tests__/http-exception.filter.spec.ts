import {
  ArgumentsHost,
  HttpException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { HttpExceptionFilter } from '../http-exception.filter';

function mockHost() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const setHeader = jest.fn();
  const response = { status, setHeader };
  const request = { method: 'GET', url: '/x', headers: {} as Record<string, string> };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json, setHeader, request };
}

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  beforeEach(() => {
    filter = new HttpExceptionFilter();
  });

  it('normalizes string HttpException bodies', () => {
    const { host, status, json } = mockHost();
    filter.catch(new UnauthorizedException('missing_token'), host);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'missing_token' });
  });

  it('normalizes single-string message in object body', () => {
    const { host, status, json } = mockHost();
    const ex = new HttpException({ message: 'foo' }, 418);
    filter.catch(ex, host);
    expect(status).toHaveBeenCalledWith(418);
    expect(json).toHaveBeenCalledWith({ error: 'foo' });
  });

  it('joins array message bodies (ValidationPipe case)', () => {
    const { host, status, json } = mockHost();
    const ex = new BadRequestException({ message: ['a must be string', 'b must be number'] });
    filter.catch(ex, host);
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({ error: 'a must be string; b must be number' });
  });

  it('returns internal_error for unknown throws', () => {
    const { host, status, json } = mockHost();
    // Silence the logger for this test — stub it.
    const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    filter.catch(new Error('boom'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: 'internal_error',
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
    spy.mockRestore();
  });

  it('echoes a safe incoming x-request-id on the header and in 5xx bodies', () => {
    const { host, json, setHeader, request } = mockHost();
    request.headers['x-request-id'] = 'req-1234567890';
    filter.catch(new HttpException('down', 503), host);
    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'req-1234567890');
    expect(json).toHaveBeenCalledWith({ error: 'down', request_id: 'req-1234567890' });
  });

  it('ignores a malformed incoming x-request-id and keeps 4xx bodies unchanged', () => {
    const { host, json, setHeader, request } = mockHost();
    request.headers['x-request-id'] = 'bad id <script>';
    filter.catch(new BadRequestException('nope'), host);
    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
    expect(json).toHaveBeenCalledWith({ error: 'nope' });
  });
});
