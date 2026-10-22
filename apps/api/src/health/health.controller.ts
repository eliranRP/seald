import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Public } from '../auth/public.decorator';
import type { AuthUser } from '../auth/auth-user';

@Controller()
export class HealthController {
  @Public()
  @Get('health')
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }

  // /me explicitly authenticates against the global AuthGuard (no @Public()).
  // The redundant @UseGuards keeps the local intent visible for readers.
  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): Pick<AuthUser, 'id' | 'email' | 'provider'> {
    // Shape unchanged by WP-14: the sign-in time stays server-side.
    return { id: user.id, email: user.email, provider: user.provider };
  }
}
