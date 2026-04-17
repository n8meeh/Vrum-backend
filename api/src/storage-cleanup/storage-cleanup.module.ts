import { Module } from '@nestjs/common';
import { StorageCleanupService } from './storage-cleanup.service';
import { StorageCleanupController } from './storage-cleanup.controller';

@Module({
  controllers: [StorageCleanupController],
  providers: [StorageCleanupService],
})
export class StorageCleanupModule {}
