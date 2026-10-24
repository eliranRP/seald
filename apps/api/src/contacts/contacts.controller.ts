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
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth-user';
import type { Contact, ContactWithStats } from './contact.entity';
import { ContactsService, type BulkCreateResult } from './contacts.service';
import { BulkCreateContactsDto } from './dto/bulk-contacts.dto';
import { ContactIdsDto } from './dto/contact-ids.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

// AuthGuard is registered globally as APP_GUARD in AuthModule (rule 5.1).
// No `@UseGuards(AuthGuard)` needed — every route here authenticates by
// default unless tagged with `@Public()`.
@Controller('contacts')
export class ContactsController {
  constructor(private readonly svc: ContactsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ReadonlyArray<ContactWithStats>> {
    return this.svc.list(user.id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateContactDto): Promise<Contact> {
    return this.svc.create(user.id, dto);
  }

  /** Add many contacts from a pasted list of addresses. */
  @Post('bulk')
  @HttpCode(200)
  bulk(
    @CurrentUser() user: AuthUser,
    @Body() dto: BulkCreateContactsDto,
  ): Promise<BulkCreateResult> {
    return this.svc.createMany(user.id, dto.emails);
  }

  /** Undo a delete (the Undo toast). */
  @Post('restore')
  @HttpCode(200)
  restore(
    @CurrentUser() user: AuthUser,
    @Body() dto: ContactIdsDto,
  ): Promise<ReadonlyArray<Contact>> {
    return this.svc.restore(user.id, dto.ids);
  }

  /** Soft-delete several contacts at once (bulk bar). */
  @Delete()
  @HttpCode(200)
  removeMany(
    @CurrentUser() user: AuthUser,
    @Body() dto: ContactIdsDto,
  ): Promise<{ deleted: string[] }> {
    return this.svc.removeMany(user.id, dto.ids);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Contact> {
    return this.svc.get(user.id, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<Contact> {
    return this.svc.update(user.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.svc.remove(user.id, id);
  }
}
