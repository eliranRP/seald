import { Global, Module, type OnApplicationShutdown, Inject } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { ConfigModule } from '../config/config.module';
import { createDbProvider, DB_TOKEN } from './db.provider';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [createDbProvider()],
  exports: [DB_TOKEN],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
