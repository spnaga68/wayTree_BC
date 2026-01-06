import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";
import { upload } from "../middleware/uploadMiddleware";
import { uploadToS3 } from "../services/s3Service";

const router = Router();

/**
 * POST /api/upload
 * Handles single file upload to S3 (Images or PDFs)
 */
router.post(
    "/",
    authMiddleware,
    upload.single("file"),
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            console.log(`📁 [UPLOAD] Received upload request from user: ${req.user?.userId}`);

            if (!req.file) {
                console.warn("⚠️ [UPLOAD] No file provided in request");
                res.status(400).json({ error: "No file uploaded" });
                return;
            }

            const folder = req.body.folder || "general";
            const fileUrl = await uploadToS3(
                req.file.buffer,
                req.file.originalname,
                req.file.mimetype,
                folder
            );

            console.log(`✅ [UPLOAD] File uploaded successfully for user ${req.user?.userId}: ${fileUrl}`);

            res.status(200).json({
                message: "File uploaded successfully",
                url: fileUrl,
                fileName: req.file.originalname,
                mimetype: req.file.mimetype
            });
        } catch (error: any) {
            console.error("❌ [UPLOAD] Server Error during file upload:", error);
            res.status(500).json({
                error: "Upload failed",
                message: error.message
            });
        }
    }
);

export default router;
