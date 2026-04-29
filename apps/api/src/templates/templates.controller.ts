import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import type { Template } from 'shared';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { CreateTemplateDto } from './dto/create-template.dto';
import { UpdateTemplateDto } from './dto/update-template.dto';
import { TemplatesService } from './templates.service';

// AuthGuard is registered globally as APP_GUARD in AuthModule — every
// route here authenticates by default.
@Controller('templates')
export class TemplatesController {
  constructor(private readonly svc: TemplatesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<Template>> {
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTemplateDto): Promise<Template> {
    return this.svc.create(user.id, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Template> {
    return this.svc.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ): Promise<Template> {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.remove(user.id, id);
  }

  /**
   * Bumps `uses_count` and `last_used_at`. Called by the upload-flow
   * integration when a sender clicks "Continue with this template" on
   * `/templates/:id/use`. Returns the updated record so the SPA can
   * reflect the new lastUsed timestamp without a follow-up GET.
   */
  @Post(':id/use')
  @HttpCode(200)
  use(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Template> {
    return this.svc.use(user.id, id);
  }
}
