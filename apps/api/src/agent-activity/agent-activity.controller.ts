import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import type { AgentActivityResponse } from 'shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { AgentActivityService } from './agent-activity.service';

const ListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

/**
 * `GET /agent-activity`: what each key did for the signed-in owner, newest
 * first (WP-26). Supabase session only: the global `AuthGuard` refuses an
 * API key here with 401, so an agent never reads its owner's audit list.
 * `ApiKeysFlagMiddleware` 404s it before auth while the MCP and REST v1
 * surfaces are both off.
 */
@Controller('agent-activity')
export class AgentActivityController {
  constructor(private readonly svc: AgentActivityService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<AgentActivityResponse> {
    const parsed = ListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    return this.svc.list(user.id, parsed.data);
  }
}
