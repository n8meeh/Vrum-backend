import { Controller, Post, UseGuards } from '@nestjs/common';
import { StorageCleanupService } from './storage-cleanup.service';

@Controller('admin/storage-cleanup')
export class StorageCleanupController {
  constructor(private readonly cleanupService: StorageCleanupService) {}

  @Post('trigger')
  async triggerCleanup() {
    // Run in background to avoid timeout
    this.cleanupService.handleStorageCleanup();
    return {
      message: 'Storage cleanup process started in background. Check server logs for details.',
    };
  }
}
