import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";

const router = Router();

/**
 * POST /upload
 * File upload temporarily disabled - Cloudinary removed
 * TODO: Implement Base64 or local file storage if needed
 */
router.post(
    "/",
    authMiddleware,
    async (_req: AuthRequest, res: Response) => {
        res.status(501).json({
            error: "Not Implemented",
            message: "File upload feature is currently disabled. Use Base64 encoding for images.",
        });
    }
);

export default router;
