import { Body, Controller, Delete, Get, HttpCode, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { MeService } from './me.service';

/**
 * T-19 (`GET /me/export`) and T-20 (`DELETE /me`) — DSAR / right-to-
 * erasure surface required for GDPR Art. 15 / Art. 17 and CCPA §1798.105.
 * Both endpoints sit behind the global `AuthGuard`. The throttle limits
 * are tight because both are heavy: export hydrates the user's full
 * aggregate and delete is irreversible.
 */
@Controller('me')
export class MeController {
  constructor(private readonly svc: MeService) {}

  @Get('export')
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  async exportAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    const payload = await this.svc.exportAll(user);
    const filename = `seald-export-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
    res
      .setHeader('Content-Type', 'application/json; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      // Don't let any caching layer keep the user's data.
      .setHeader('Cache-Control', 'no-store')
      .send(JSON.stringify(payload, null, 2));
  }

  @Delete()
  @HttpCode(204)
  @Throttle({ short: { limit: 1, ttl: 60_000 }, long: { limit: 5, ttl: 3_600_000 } })
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() _dto: DeleteAccountDto,
  ): Promise<void> {
    // The DTO already validated the confirm phrase (`@Equals(...)`); we
    // discard it here and only forward the user identity. If the
    // confirm field is wrong, validation throws 400 before we get
    // called.
    await this.svc.deleteAccount(user);
  }
}
