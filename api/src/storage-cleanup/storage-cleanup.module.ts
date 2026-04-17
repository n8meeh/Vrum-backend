import { Module } from '@nestjs/common';
import { StorageCleanupService } from './storage-cleanup.service';

@Module({
  providers: [StorageCleanupService],
})
export class StorageCleanupModule {}
