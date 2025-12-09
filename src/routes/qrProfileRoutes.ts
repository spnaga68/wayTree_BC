import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";
import { QRProfile } from "../models/QRProfile";
import { Following } from "../models/Following";
import mongoose from "mongoose";

const router = Router();

/**
 * POST /qr-profiles
 * Create a new QR profile
 */
router.post(
    "/",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const userId = req.user?.userId;
            if (!userId) {
                res.status(401).json({
                    error: "Unauthorized",
                    message: "User not authenticated",
                });
                return;
            }

            const { title, description, context, qrCodeId, customMessage } = req.body;

            // Validate required fields
            if (!title || !description || !context || !qrCodeId) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Missing required fields: title, description, context, qrCodeId",
                });
                return;
            }

            // Check if qrCodeId already exists
            const existing = await QRProfile.findOne({ qrCodeId });
            if (existing) {
                res.status(409).json({
                    error: "Conflict",
                    message: "QR code ID already exists",
                });
                return;
            }

            const qrProfile = await QRProfile.create({
                userId: new mongoose.Types.ObjectId(userId),
                title,
                description,
                context,
                qrCodeId,
                customMessage: customMessage || "",
            });

            res.status(201).json({
                message: "QR profile created successfully",
                data: {
                    id: qrProfile._id.toString(),
                    userId: qrProfile.userId.toString(),
                    title: qrProfile.title,
                    description: qrProfile.description,
                    context: qrProfile.context,
                    qrCodeId: qrProfile.qrCodeId,
                    customMessage: qrProfile.customMessage,
                    createdAt: qrProfile.createdAt,
                },
            });
        } catch (error) {
            console.error("Error creating QR profile:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to create QR profile",
            });
        }
    }
);

/**
 * GET /qr-profiles/:id
 * Get QR profile by ID (qrCodeId)
 */
router.get(
    "/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            const qrProfile = await QRProfile.findOne({ qrCodeId: id }).populate(
                "userId",
                "name email role company location photoUrl oneLiner"
            );

            if (!qrProfile) {
                res.status(404).json({
                    error: "Not Found",
                    message: "QR profile not found",
                });
                return;
            }

            const user = qrProfile.userId as any;

            res.json({
                message: "QR profile retrieved successfully",
                data: {
                    id: qrProfile._id.toString(),
                    userId: user._id.toString(),
                    title: qrProfile.title,
                    description: qrProfile.description,
                    context: qrProfile.context,
                    qrCodeId: qrProfile.qrCodeId,
                    customMessage: qrProfile.customMessage,
                    createdAt: qrProfile.createdAt,
                    user: {
                        name: user.name,
                        email: user.email,
                        role: user.role,
                        company: user.company,
                        location: user.location,
                        photoUrl: user.photoUrl,
                        oneLiner: user.oneLiner,
                    },
                },
            });
        } catch (error) {
            console.error("Error fetching QR profile:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch QR profile",
            });
        }
    }
);

/**
 * GET /qr-profiles/user/:userId
 * Get all QR profiles for a user
 */
router.get(
    "/user/:userId",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { userId } = req.params;

            const qrProfiles = await QRProfile.find({
                userId: new mongoose.Types.ObjectId(userId),
            }).sort({ createdAt: -1 });

            res.json({
                message: "QR profiles retrieved successfully",
                count: qrProfiles.length,
                data: qrProfiles.map((profile) => ({
                    id: profile._id.toString(),
                    userId: profile.userId.toString(),
                    title: profile.title,
                    description: profile.description,
                    context: profile.context,
                    qrCodeId: profile.qrCodeId,
                    customMessage: profile.customMessage,
                    createdAt: profile.createdAt,
                })),
            });
        } catch (error) {
            console.error("Error fetching user QR profiles:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch QR profiles",
            });
        }
    }
);

/**
 * POST /qr-profiles/:id/scan
 * Record QR scan and create following relationship
 */
router.post(
    "/:id/scan",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const scannerId = req.user?.userId;
            if (!scannerId) {
                res.status(401).json({
                    error: "Unauthorized",
                    message: "User not authenticated",
                });
                return;
            }

            const { id: qrCodeId } = req.params;

            // Find the QR profile
            const qrProfile = await QRProfile.findOne({ qrCodeId });
            if (!qrProfile) {
                res.status(404).json({
                    error: "Not Found",
                    message: "QR profile not found",
                });
                return;
            }

            const profileOwnerId = qrProfile.userId.toString();

            // Don't allow scanning own QR code
            if (scannerId === profileOwnerId) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Cannot scan your own QR code",
                });
                return;
            }

            // Check if already following
            const existingFollow = await Following.findOne({
                followerId: new mongoose.Types.ObjectId(scannerId),
                followingId: new mongoose.Types.ObjectId(profileOwnerId),
            });

            if (existingFollow) {
                res.status(200).json({
                    message: "Already following this user",
                    alreadyFollowing: true,
                });
                return;
            }

            // Create following relationship
            await Following.create({
                followerId: new mongoose.Types.ObjectId(scannerId),
                followingId: new mongoose.Types.ObjectId(profileOwnerId),
                type: "qr_scan",
                label: qrProfile.title,
            });

            res.status(201).json({
                message: "QR scan recorded and connection created",
                data: {
                    qrProfileId: qrProfile._id.toString(),
                    profileOwnerId,
                    scannerId,
                },
            });
        } catch (error) {
            console.error("Error recording QR scan:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to record QR scan",
            });
        }
    }
);

export default router;
