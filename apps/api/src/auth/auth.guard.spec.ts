import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import type { AuthUser } from './auth-user';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockContext(headers: Record<string, string | undefined>, req: any = {}): ExecutionContext {
  const request = { headers, ...req };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function makeGuard(validate: (token: string) => Promise<AuthUser>) {
  const strategy = { validate } as unknown as SupabaseJwtStrategy;
  return { guard: new AuthGuard(strategy), strategy };
}

describe('AuthGuard', () => {
  it('rejects missing Authorization header', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('should not be called');
    });
    const ctx = mockContext({});
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'missing_token',
    });
  });

  it('rejects malformed Authorization header', async () => {
    const { guard } = makeGuard(async () => {
      throw new Error('should not be called');
    });
    const ctx = mockContext({ authorization: 'Basic abc' });
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({
      message: 'missing_token',
    });
  });

  it('delegates to strategy and populates request.user', async () => {
    const user: AuthUser = { id: 'u1', email: 'a@b.com', provider: 'google' };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const req: any = { headers: { authorization: 'Bearer abc.def.ghi' } };
    const { guard } = makeGuard(async (t) => {
      expect(t).toBe('abc.def.ghi');
      return user;
    });
    const ctx = {
      switchToHttp: () => ({ getRequest: () => req }),
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
});
