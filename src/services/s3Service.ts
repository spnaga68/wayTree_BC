import { S3Client, PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});

/**
 * Uploads a file buffer to AWS S3 with structured paths for events.
 * @param buffer - The file buffer to upload.
 * @param fileName - The original filename.
 * @param contentType - The MIME type of the file.
 * @param folder - Sub-folder (profiles, events, documents).
 * @param eventId - Optional event ID for structured paths.
 * @param mediaType - Type of media (images, pdfs, videos) for event organization.
 * @returns Promise<string> - The public S3 URL.
 */
export const uploadToS3 = async (
    buffer: Buffer,
    fileName: string,
    contentType: string,
    folder: string = 'uploads',
    eventId?: string,
    mediaType?: 'images' | 'pdfs' | 'videos'
): Promise<string> => {
    try {
        const timestamp = Date.now();
        const safeFileName = fileName.replace(/[^a-z0-9.]/gi, '_').toLowerCase();

        // Structured path for events: events/{eventId}/{mediaType}/{timestamp}-{filename}
        let key: string;
        if (eventId && mediaType) {
            key = `events/${eventId}/${mediaType}/${timestamp}-${safeFileName}`;
        } else {
            key = `${folder}/${timestamp}-${safeFileName}`;
        }

        const command = new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: contentType
        });

        await s3Client.send(command);

        const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
        console.log(`📡 [S3 UPLOAD] Success: ${url}`);
        return url;
    } catch (error) {
        console.error('❌ [S3 UPLOAD] Error:', error);
        throw error;
    }
};

/**
 * Deletes a single file from S3 using its URL.
 * @param url - The full S3 URL of the file to delete.
 * @returns Promise<void>
 */
export const deleteFromS3 = async (url: string): Promise<void> => {
    try {
        // Extract key from URL
        // Format: https://bucket.s3.region.amazonaws.com/key
        const urlParts = url.split('.amazonaws.com/');
        if (urlParts.length !== 2) {
            throw new Error(`Invalid S3 URL format: ${url}`);
        }

        const key = urlParts[1];

        const command = new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: key,
        });

        await s3Client.send(command);
        console.log(`🗑️  [S3 DELETE] Success: ${key}`);
    } catch (error) {
        console.error(`❌ [S3 DELETE] Error deleting ${url}:`, error);
        throw error;
    }
};

/**
 * Deletes multiple files from S3 using their URLs.
 * @param urls - Array of S3 URLs to delete.
 * @returns Promise<void>
 */
export const deleteMultipleFromS3 = async (urls: string[]): Promise<void> => {
    if (!urls || urls.length === 0) return;

    try {
        // Extract keys from URLs
        const keys = urls.map(url => {
            const urlParts = url.split('.amazonaws.com/');
            if (urlParts.length !== 2) {
                console.warn(`⚠️  Skipping invalid S3 URL: ${url}`);
                return null;
            }
            return urlParts[1];
        }).filter(key => key !== null) as string[];

        if (keys.length === 0) return;

        // S3 DeleteObjects supports up to 1000 keys at once
        const command = new DeleteObjectsCommand({
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Delete: {
                Objects: keys.map(key => ({ Key: key })),
                Quiet: false,
            },
        });

        const result = await s3Client.send(command);
        console.log(`🗑️  [S3 DELETE BATCH] Deleted ${result.Deleted?.length || 0} objects`);

        if (result.Errors && result.Errors.length > 0) {
            console.error(`❌ [S3 DELETE BATCH] Errors:`, result.Errors);
        }
    } catch (error) {
        console.error('❌ [S3 DELETE BATCH] Error:', error);
        throw error;
    }
};
