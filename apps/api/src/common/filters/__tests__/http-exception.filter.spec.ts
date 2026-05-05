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
  const response = { status };
  const request = { method: 'GET', url: '/x' };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
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
    expect(json).toHaveBeenCalledWith({ error: 'internal_error' });
    spy.mockRestore();
  });
});
