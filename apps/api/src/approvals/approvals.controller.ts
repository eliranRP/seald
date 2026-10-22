import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { Request } from 'express';
import { APPROVAL_STATUSES, type ApprovalDetail, type ApprovalListResponse } from 'shared';
import { z } from 'zod';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { extractClientIp } from '../common/extract-client-ip';
import { ApprovalResponseHeadersInterceptor } from './approval-response-headers.interceptor';
import { ApprovalsService, type DecisionAudit } from './approvals.service';

const ListQuerySchema = z.strictObject({
  status: z.enum(APPROVAL_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export function decisionAudit(req: Request): DecisionAudit {
  const ua = req.headers['user-agent'];
  return { ip: extractClientIp(req), userAgent: typeof ua === 'string' ? ua : null };
}

/**
 * The in-app approval queue and the guided review's decisions
 * (docs/design/mcp-server.md § Owner approval; MCP steps 7b and 7d,
 * server side). Supabase session JWT only: the global `AuthGuard`
 * refuses an API key here with 401, so an agent can never decide.
 * `ApiKeysFlagMiddleware` 404s every route before auth while the MCP
 * and REST v1 surfaces are both off.
 *
 * Deny, never Decline: Decline stays the signer's word on `/sign`. There
 * is no `/decline` route.
 */
@Controller('approvals')
@UseInterceptors(ApprovalResponseHeadersInterceptor)
export class ApprovalsController {
  constructor(private readonly svc: ApprovalsService) {}

  /** `GET /approvals?status=`: the queue, newest first, plus the bell count. */
  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: unknown): Promise<ApprovalListResponse> {
    const parsed = ListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    const { status, limit, cursor } = parsed.data;
    return this.svc.list(user, {
      ...(status ? { status } : {}),
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
    });
  }

  /** `GET /approvals/:id`: one card. Another owner's id is 404. */
  @Get(':id')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalDetail> {
    return this.svc.get(user, id);
  }

  /** In-app (and guided-review) Approve. Needs a sign-in within 12 hours. */
  @Post(':id/approve')
  @HttpCode(200)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<ApprovalDetail> {
    return this.svc.approveInApp(user, id, decisionAudit(req));
  }

  /** In-app Deny. A session, no freshness window. */
  @Post(':id/deny')
  @HttpCode(200)
  deny(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
  ): Promise<ApprovalDetail> {
    return this.svc.denyInApp(user, id, decisionAudit(req));
  }

  /**
   * After the owner saves an edit from Review: re-mint on the same
   * pending approval (new email, previous link kept as the one alias).
   */
  @Post(':id/refresh')
  @HttpCode(200)
  refresh(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApprovalDetail> {
    return this.svc.refreshAfterOwnerEdit(user, id);
  }
}
