import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from './auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

type RequestStub = { user?: AuthUser } & Record<string, unknown>;

function mockContext(
  headers: Record<string, string | undefined>,
  req: RequestStub = {},
): ExecutionContext {
  const request: RequestStub = { headers, ...req };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeGuard(
  validate: (token: string) => Promise<AuthUser>,
  isPublic = false,
): { guard: AuthGuard; strategy: SupabaseJwtStrategy } {
  const strategy = { validate } as unknown as SupabaseJwtStrategy;
  const reflector = {
    getAllAndOverride: (key: string) => (key === IS_PUBLIC_KEY ? isPublic : undefined),
  } as unknown as Reflector;
  return { guard: new AuthGuard(strategy, reflector), strategy };
}

describe('AuthGuard', () => {
  // Rule 2.4 — collapse the six "this header should be rejected as
  // missing_token" variants into a single it.each table so adding a new
  // case is one row instead of one `it`. The table covers absent header,
  // wrong scheme, lowercase scheme, missing token half, leading space
  // (split returns ['', 'Bearer', 'abc']), and an empty bearer value.
  it.each<{ readonly label: string; readonly header: string | undefined }>([
    { label: 'header absent', header: undefined },
    { label: 'wrong scheme (Basic)', header: 'Basic abc' },
    { label: 'lowercase scheme', header: 'bearer abc.def.ghi' },
    { label: 'missing token half', header: 'Bearer' },
    { label: 'empty bearer value', header: 'Bearer ' },
    { label: 'leading whitespace', header: ' Bearer abc' },
  ])('rejects header variant — $label', async ({ header }) => {
    const { guard } = makeGuard(async () => {
      throw new Error('should not be called');
    });
    const ctx = mockContext(header === undefined ? {} : { authorization: header });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'missing_token',
    });
  });

  it('delegates to strategy and populates request.user', async () => {
    const user: AuthUser = { id: 'u1', email: 'a@b.com', provider: 'google' };
    const req: RequestStub = { headers: { authorization: 'Bearer abc.def.ghi' } };
    const { guard } = makeGuard(async (t) => {
      expect(t).toBe('abc.def.ghi');
      return user;
    });
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(req.user).toEqual(user);
  });

  it('propagates UnauthorizedException from strategy', async () => {
    const { guard } = makeGuard(async () => {
      throw new UnauthorizedException('token_expired');
    });
    const ctx = mockContext({ authorization: 'Bearer expired' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'token_expired',
    });
  });

  it('bypasses auth when route is marked @Public()', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('strategy should not run for public routes');
    }, true);
    const ctx = mockContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
