import { Controller, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { AutomationTestResult } from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { AutomationTestRateLimitedError } from './automation-test-rate-limiter';
import { AutomationTestService } from './automation-test.service';

/**
 * A2b: `POST /automations/:id/test`. Owner session (the global AuthGuard),
 * 404 while `workflowAutomations` is off, another owner's recipe is 404.
 * The rest of `/automations` (list, create, runs, retry) lands with the
 * settings page (WP-31). The id is validated after the flag check, so a
 * dark route answers 404 for any id rather than 400.
 */
@Controller('automations')
export class AutomationTestController {
  constructor(private readonly svc: AutomationTestService) {}

  @Post(':id/test')
  @HttpCode(200)
  async test(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AutomationTestResult> {
    try {
      return await this.svc.sendTest(user.id, id);
    } catch (err) {
      if (err instanceof AutomationTestRateLimitedError) {
        res.setHeader('Retry-After', String(err.retryAfterSeconds));
      }
      throw err;
    }
  }
}
