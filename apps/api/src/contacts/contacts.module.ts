import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ContactsController } from './contacts.controller';
import { ContactsRepository } from './contacts.repository';
import { ContactsPgRepository } from './contacts.repository.pg';
import { ContactsService } from './contacts.service';

@Module({
  imports: [AuthModule],
  controllers: [ContactsController],
  providers: [ContactsService, { provide: ContactsRepository, useClass: ContactsPgRepository }],
})
export class ContactsModule {}
