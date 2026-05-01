import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import * as admin from 'firebase-admin';
import * as path from 'path';

@Injectable()
export class FirebaseService implements OnModuleInit {
    private storage: admin.storage.Storage;
    private readonly logger = new Logger(FirebaseService.name);

    // 🔴 PON AQUÍ EL NOMBRE EXACTO QUE COPIASTE DE LA CONSOLA
    // ¡SIN EL 'gs://' AL PRINCIPIO!
    private readonly bucketName = 'vrum-app-4f563.firebasestorage.app';

    onModuleInit() {
        const jsonPath = path.resolve('firebase-adminsdk.json');

        if (!admin.apps.length) {
            const serviceAccount = require(jsonPath);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                storageBucket: this.bucketName // Lo inyectamos aquí
            });
        }
        this.storage = admin.storage();
    }

    async uploadFile(file: Express.Multer.File, folder: string = 'uploads'): Promise<string> {
        // Forzamos el uso del bucket específico
        const bucket = this.storage.bucket(this.bucketName);

        const filename = `${folder}/${Date.now()}_${file.originalname}`;
        const fileRef = bucket.file(filename);

        this.logger.log(`Intentando subir a bucket: ${this.bucketName}`);

        try {
            await fileRef.save(file.buffer, {
                contentType: file.mimetype,
                public: true,
            });

            return `https://storage.googleapis.com/${this.bucketName}/${filename}`;

        } catch (error) {
            this.logger.error(`❌ ERROR GRAVE: No se encuentra el bucket ${this.bucketName}. Verifica la consola de Firebase.`);
            throw error;
        }
    }

    /**
     * Deletes a file from Firebase Storage given its public download URL.
     * Silently skips URLs that don't belong to this bucket or are not parseable.
     * Errors during deletion are logged as warnings so they never break the caller.
     */
    async deleteFileByUrl(url: string): Promise<void> {
        if (!url) return;
        const storagePath = this.extractStoragePath(url);
        if (!storagePath) {
            this.logger.warn(`deleteFileByUrl: could not parse path from URL "${url}"`);
            return;
        }
        try {
            const bucket = this.storage.bucket(this.bucketName);
            await bucket.file(storagePath).delete();
            this.logger.log(`🗑️ Deleted from storage: ${storagePath}`);
        } catch (error) {
            this.logger.warn(`deleteFileByUrl: could not delete "${storagePath}": ${error.message}`);
        }
    }

    private extractStoragePath(url: string): string | null {
        try {
            const prefix1 = `https://storage.googleapis.com/${this.bucketName}/`;
            if (url.startsWith(prefix1)) {
                return decodeURIComponent(url.slice(prefix1.length).split('?')[0]);
            }
            const prefix2 = `https://firebasestorage.googleapis.com/v0/b/${this.bucketName}/o/`;
            if (url.startsWith(prefix2)) {
                return decodeURIComponent(url.slice(prefix2.length).split('?')[0]);
            }
            return null;
        } catch {
            return null;
        }
    }
}