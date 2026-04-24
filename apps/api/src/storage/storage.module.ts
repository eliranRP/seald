import { Global, Module } from '@nestjs/common';
import { StorageService, SupabaseStorageService } from './storage.service';

/**
 * Global so any module can inject StorageService without importing StorageModule.
 * The adapter is swappable via env — today there is only the Supabase backend,
 * but a future S3 / R2 adapter would plug in here with zero callsite changes.
 */
@Global()
@Module({
  providers: [{ provide: StorageService, useClass: SupabaseStorageService }],
  exports: [StorageService],
})
export class StorageModule {}
