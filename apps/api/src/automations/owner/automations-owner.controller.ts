import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import type {
  AutomationRunOutput,
  OwnerAutomation,
  OwnerAutomationList,
  OwnerAutomationResponse,
  RotateSecretResponse,
} from 'shared';
import {
  CreateAutomationRequestSchema,
  OwnerRunListQuerySchema,
  UpdateAutomationRequestSchema,
} from 'shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import type { UpsertRecipeInput } from '../automations.service';
import { AutomationsOwnerService } from './automations-owner.service';

type Fields = {
  name?: string | undefined;
  scope?: 'account' | 'template' | undefined;
  template_id?: string | undefined;
  url?: string | undefined;
  payload_detail?: 'ids' | 'with_signer' | undefined;
  recipients?: string[] | undefined;
};

function toInput(f: Fields): UpsertRecipeInput {
  return {
    name: f.name,
    scope: f.scope,
    templateId: f.template_id,
    url: f.url,
    payloadDetail: f.payload_detail,
    recipients: f.recipients,
  };
}

/**
 * The settings page's routes (WP-31). Session JWT through the global
 * `AuthGuard` (an API key is refused there), 404 while
 * `workflowAutomations` is off, another owner's id is 404. Every route
 * mirrors a WP-30 MCP tool and calls the same `AutomationsService`; see
 * `AutomationsOwnerService`. `POST /automations/:id/test` is A2b's
 * `AutomationTestController`.
 *
 * Bodies and ids are checked after the flag gate, so a dark route answers
 * 404 for anything. A webhook address is never returned; the signing
 * secret is in the create response and the rotate response only.
 */
@Controller('automations')
export class AutomationsOwnerController {
  constructor(private readonly svc: AutomationsOwnerService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<OwnerAutomationList> {
    this.svc.gate();
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<OwnerAutomationResponse> {
    this.svc.gate();
    const parsed = CreateAutomationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    return this.svc.create(user.id, { recipe: parsed.data.recipe, ...toInput(parsed.data) });
  }

  // Declared before `:id` routes so `runs` is never read as a recipe id.
  @Get('runs/:runId')
  getRun(
    @CurrentUser() user: AuthUser,
    @Param('runId') runId: string,
  ): Promise<AutomationRunOutput> {
    this.svc.gate();
    return this.svc.getRun(user.id, AutomationsOwnerService.requireId(runId));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<OwnerAutomation> {
    this.svc.gate();
    return this.svc.get(user.id, AutomationsOwnerService.requireId(id));
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<OwnerAutomationResponse> {
    this.svc.gate();
    const automationId = AutomationsOwnerService.requireId(id);
    const parsed = UpdateAutomationRequestSchema.safeParse(body ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    return this.svc.update(user.id, automationId, {
      ...toInput(parsed.data),
      enabled: parsed.data.enabled,
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    this.svc.gate();
    await this.svc.remove(user.id, AutomationsOwnerService.requireId(id));
  }

  @Post(':id/rotate-secret')
  @HttpCode(200)
  rotateSecret(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
  ): Promise<RotateSecretResponse> {
    this.svc.gate();
    return this.svc.rotateSecret(user.id, AutomationsOwnerService.requireId(id));
  }

  @Get(':id/runs')
  listRuns(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: unknown) {
    this.svc.gate();
    const automationId = AutomationsOwnerService.requireId(id);
    const parsed = OwnerRunListQuerySchema.safeParse(query ?? {});
    if (!parsed.success) throw new BadRequestException('validation_error');
    return this.svc.listRuns(user.id, automationId, {
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
      ...(parsed.data.cursor !== undefined ? { cursor: parsed.data.cursor } : {}),
    });
  }

  @Post(':id/runs/:runId/retry')
  @HttpCode(200)
  retryRun(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('runId') runId: string) {
    this.svc.gate();
    return this.svc.retryRun(
      user.id,
      AutomationsOwnerService.requireId(id),
      AutomationsOwnerService.requireId(runId),
    );
  }
}
