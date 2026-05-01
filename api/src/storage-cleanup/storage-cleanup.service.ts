import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import * as admin from 'firebase-admin';

const BUCKET_NAME = 'vrum-app-4f563.firebasestorage.app';

// Minimum age (ms) a file must have before being considered for deletion.
// 24 hours prevents removing files being uploaded at cleanup time.
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Runs every Sunday at 03:00 AM (server time).
   * Deletes Firebase Storage files that are not referenced in the database
   * and are older than 24 hours.
   *
   * Weekly cadence is sufficient because cascade-delete logic removes orphans
   * immediately on most write paths, keeping the orphan backlog minimal.
   */
  @Cron('0 3 * * 0', { name: 'storage-cleanup' })
  async handleStorageCleanup(): Promise<void> {
    this.logger.log('🔄 Starting Firebase Storage orphan cleanup...');

    try {
      const bucket = admin.storage().bucket(BUCKET_NAME);
      const [exists] = await bucket.exists();
      if (!exists) {
        this.logger.error(`❌ Bucket "${BUCKET_NAME}" not found. Check configuration.`);
        return;
      }

      const referencedPaths = await this.getAllReferencedPaths();
      this.logger.log(`📦 Found ${referencedPaths.size} unique referenced file paths in DB.`);

      const [files] = await bucket.getFiles();
      this.logger.log(`☁️  Found ${files.length} total objects in Firebase Storage.`);

      const now = Date.now();
      let deletedCount = 0;
      let skippedNewCount = 0;
      let skippedInDbCount = 0;

      for (const file of files) {
        // Ignorar objetos que representan carpetas virtuales (nombres que terminan en /)
        if (file.name.endsWith('/')) continue;

        // file.metadata is already populated by bucket.getFiles() — no extra API call needed.
        // Calling file.getMetadata() here would waste 1 read operation per file (N extra calls).
        const timeCreated = new Date(file.metadata.timeCreated as string).getTime();
        const ageMs = now - timeCreated;

        const filePath = file.name;

        // 1. Saltars archivos con menos de 24 horas
        if (ageMs < MIN_AGE_MS) {
          skippedNewCount++;
          continue;
        }

        // 2. Saltar si está referenciado en la base de datos
        if (referencedPaths.has(filePath)) {
          skippedInDbCount++;
          continue;
        }

        // 3. Borrar huérfano
        try {
          await file.delete();
          this.logger.log(`🗑️  Deleted orphan: ${filePath}`);
          deletedCount++;
        } catch (deleteErr) {
          this.logger.error(`❌ Failed to delete ${filePath}:`, deleteErr);
        }
      }

      this.logger.log(
        `✅ Cleanup complete. Deleted: ${deletedCount} | Too New: ${skippedNewCount} | In DB: ${skippedInDbCount} | Total: ${files.length}`,
      );
    } catch (err) {
      this.logger.error('❌ Storage cleanup failed:', err);
    }
  }

  /**
   * Builds a Set of all file paths currently referenced in the database.
   * Handles both plain-string URL columns and JSON-array URL columns.
   */
  private async getAllReferencedPaths(): Promise<Set<string>> {
    const paths = new Set<string>();

    // ── Plain varchar URL columns ──────────────────────────────────────────
    const plainUrlQueries = [
      { table: 'users', col: 'avatar_url', query: 'SELECT avatar_url AS url FROM `users` WHERE avatar_url IS NOT NULL AND deleted_at IS NULL' },
      { table: 'providers', col: 'logo_url', query: 'SELECT logo_url   AS url FROM `providers` WHERE logo_url IS NOT NULL AND deleted_at IS NULL' },
      { table: 'providers', col: 'cover_url', query: 'SELECT cover_url  AS url FROM `providers` WHERE cover_url IS NOT NULL AND deleted_at IS NULL' },
      { table: 'provider_products', col: 'image_url', query: 'SELECT image_url  AS url FROM `provider_products` WHERE image_url IS NOT NULL' },
      { table: 'groups', col: 'image_url', query: 'SELECT image_url  AS url FROM `groups` WHERE image_url IS NOT NULL' },
      { table: 'native_ads', col: 'image_url', query: 'SELECT image_url  AS url FROM `native_ads` WHERE image_url IS NOT NULL' },
      { table: 'vehicles', col: 'photo_url', query: 'SELECT photo_url  AS url FROM `vehicles` WHERE photo_url IS NOT NULL AND deleted_at IS NULL' },
      { table: 'vehicle_events', col: 'attachment_url', query: 'SELECT attachment_url AS url FROM `vehicle_events` WHERE attachment_url IS NOT NULL' },
      { table: 'vehicle_types', col: 'icon_url', query: 'SELECT icon_url AS url FROM `vehicle_types` WHERE icon_url IS NOT NULL' },
    ];

    for (const item of plainUrlQueries) {
      try {
        const rows: { url: string }[] = await this.dataSource.query(item.query);
        for (const row of rows) {
          const normalized = this.extractFilePath(row.url);
          if (normalized) paths.add(normalized);
        }
      } catch (err) {
        this.logger.warn(`⚠️ Error fetching references from ${item.table}.${item.col}: ${err.message}`);
      }
    }

    // ── JSON array URL columns ─────────────────────────────────────────────
    const jsonUrlQueries = [
      { table: 'posts', col: 'media_url', query: 'SELECT media_url AS json_val FROM `posts` WHERE media_url IS NOT NULL' },
    ];

    for (const item of jsonUrlQueries) {
      try {
        const rows: { json_val: string | string[] }[] = await this.dataSource.query(item.query);
        for (const row of rows) {
          try {
            const arr: unknown[] =
              Array.isArray(row.json_val)
                ? row.json_val
                : JSON.parse(row.json_val as string);

            for (const item of arr) {
              if (typeof item === 'string') {
                const normalized = this.extractFilePath(item);
                if (normalized) paths.add(normalized);
              }
            }
          } catch { /* Malformed JSON */ }
        }
      } catch (err) {
        this.logger.warn(`⚠️ Error fetching JSON references from ${item.table}.${item.col}: ${err.message}`);
      }
    }

    return paths;
  }

  /**
   * Extracts the bucket-relative file path from any Firebase Storage URL format.
   *
   * Supported formats:
   *   1. https://storage.googleapis.com/{bucket}/{path}
   *   2. https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media&token=...
   *
   * Returns null if the URL does not belong to this bucket.
   */
  private extractFilePath(url: string | null): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
      // Format 1: public storage CDN URL
      const prefix1 = `https://storage.googleapis.com/${BUCKET_NAME}/`;
      if (url.startsWith(prefix1)) {
        const relativePath = url.slice(prefix1.length).split('?')[0];
        return decodeURIComponent(relativePath);
      }

      // Format 2: firebasestorage download URL
      const prefix2 = `https://firebasestorage.googleapis.com/v0/b/${BUCKET_NAME}/o/`;
      if (url.startsWith(prefix2)) {
        const encodedPath = url.slice(prefix2.length).split('?')[0];
        return decodeURIComponent(encodedPath);
      }

      // Si ya es una ruta relativa (por ejemplo, guardada directamente)
      if (!url.startsWith('http') && (url.includes('/') || url.includes('.'))) {
        return decodeURIComponent(url);
      }

      return null;
    } catch {
      return null;
    }
  }
}
