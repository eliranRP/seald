import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { UserSettings } from 'shared';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { AuthUser } from '../../auth/auth-user';
import { PatchUserSettingsDto } from './dto/patch-user-settings.dto';
import { UserSettingsService } from './user-settings.service';

/**
 * `GET`/`PATCH /me/settings` — the sender's own preferences: profile name,
 * saved signature and initials, notification switches, and the reminder
 * and expiry defaults. A user who never saved any reads the defaults.
 */
@Controller('me/settings')
export class UserSettingsController {
  constructor(private readonly svc: UserSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<UserSettings> {
    return this.svc.get(user.id);
  }

  @Patch()
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  patch(@CurrentUser() user: AuthUser, @Body() dto: PatchUserSettingsDto): Promise<UserSettings> {
    return this.svc.patch(user.id, dto);
  }
}
