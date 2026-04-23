import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthUser } from '../auth/auth-user';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(HealthController);
  });

  it('returns ok from /health', () => {
    expect(controller.health()).toEqual({ status: 'ok' });
  });

  it('returns the current user from /me', () => {
    const user: AuthUser = { id: 'u1', email: 'a@b.com', provider: 'google' };
    expect(controller.me(user)).toEqual(user);
  });
});
