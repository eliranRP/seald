import { Module } from '@nestjs/common';
import { AccountDirectoryRepository } from './account-directory.repository';
import { AccountDirectoryPgRepository } from './account-directory.repository.pg';
import { AccountDirectoryService } from './account-directory.service';

@Module({
  providers: [
    AccountDirectoryService,
    { provide: AccountDirectoryRepository, useClass: AccountDirectoryPgRepository },
  ],
  exports: [AccountDirectoryService],
})
export class AccountsModule {}
