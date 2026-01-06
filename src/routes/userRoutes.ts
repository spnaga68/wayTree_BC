import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware";
const { CacheTTL } = require("../services/cacheService");
import { AuthRequest } from "../types";
import { User } from "../models/User";
import { uploadToS3 } from "../services/s3Service";

const router = Router();

// Invalidate cache on all mutations
router.use(invalidateCache('route:/api/users'));

/**
 * GET /me
 * Get current user profile (protected)
 */
router.get(
  "/me",
  authMiddleware,
  cacheMiddleware(CacheTTL.SHORT), // Cache for 1 minute (user-specific)
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const user = await User.findById(req.user.userId).exec();

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        primaryGoal: user.primaryGoal,
        company: user.company,
        website: user.website,
        location: user.location,
        oneLiner: user.oneLiner,
        photoUrl: user.photoUrl,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("Error in GET /me:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user profile",
      });
    }
  }
);

/**
 * PUT /me
 * Update current user profile (protected)
 */
router.put(
  "/me",
  authMiddleware,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      console.log('📥 PUT /me Request received', req.body);
      if (!req.user) {
        console.warn('❌ PUT /me - No user in request');
        res.status(401).json({
          error: "Unauthorized",
          message: "User not authenticated",
        });
        return;
      }

      const allowedFields = [
        "name",
        "role",
        "primaryGoal",
        "company",
        "website",
        "location",
        "oneLiner",
        "photoUrl",
        "phoneNumber",
        "interests",
        "skills",
      ];

      // Filter out fields that are not allowed
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // 0. HANDLE PROFILE IMAGE UPLOAD TO S3
      if (updates.photoUrl && updates.photoUrl.startsWith('data:image')) {
        try {
          console.log(`📡 [PROFILE] Uploading new Base64 profile image to S3 for user: ${req.user.userId}`);
          const matches = updates.photoUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
          if (matches && matches.length === 3) {
            const contentType = matches[1];
            const buffer = Buffer.from(matches[2], 'base64');
            const extension = contentType.split('/')[1] || 'png';
            const fileName = `profile_${req.user.userId}_${Date.now()}.${extension}`;

            updates.photoUrl = await uploadToS3(buffer, fileName, contentType, 'profiles');
            console.log(`✅ [PROFILE] S3 URL stored: ${updates.photoUrl}`);
          }
        } catch (err) {
          console.error("❌ [PROFILE] S3 upload failed, keeping Base64 as fallback", err);
        }
      }

      // 1. VALIDATE PHONE NUMBER UNIQUENESS
      if (updates.phoneNumber) {
        const existingUser = await User.findOne({
          phoneNumber: updates.phoneNumber,
          _id: { $ne: req.user.userId }
        }).select('email');

        if (existingUser) {
          console.warn(`❌ Phone number ${updates.phoneNumber} already in use by ${existingUser.email}`);
          res.status(409).json({
            error: "Conflict",
            message: `This phone number is already registered with email: ${existingUser.email}. Please use that email for login.`,
            existingEmail: existingUser.email
          });
          return;
        }
      }


      // Check if semantic fields are being updated
      // Check if semantic fields are being updated
      const semanticFields = [
        "interests",
        "skills",
        "role",
        "primaryGoal",
        "location",
        "oneLiner", // about section
        "company",  // company info
        "name"      // even name changes might affect context
      ];
      const needsEmbeddingUpdate = semanticFields.some(
        (field) => updates[field] !== undefined
      );

      console.log(`🔍 Checking embedding update. Needs update? ${needsEmbeddingUpdate}`);
      if (!needsEmbeddingUpdate && updates.profileEmbedding) {
        // If the client explicitly sends an embedding (unlikely but possible), let it pass?
        // No, we generate it locally.
      }

      // Generate embedding SYNCHRONOUSLY if needed
      if (needsEmbeddingUpdate) {
        try {
          const { EmbeddingService } = await import("../services/embeddingService");
          // We need to merge existing user data with updates to generate a complete profile text
          // Fetch current user first to get fields that aren't being updated
          const currentUser = await User.findById(req.user.userId).lean();

          if (currentUser) {
            const mergedUser = { ...currentUser, ...updates };
            const profileText = EmbeddingService.createUserProfileText(mergedUser);

            console.log("📝 Generating LOCAL embedding for profile text:", profileText);
            if (profileText) {
              const embedding = await EmbeddingService.generateEmbedding(profileText);
              if (embedding && embedding.length > 0) {
                updates.profileEmbedding = embedding; // Add to updates
                console.log("✅ Local profile embedding generated (Dimensions: " + embedding.length + ")");
              }
            }
          }
        } catch (err) {
          console.error("❌ Failed to generate profile embedding:", err);
          // Proceed without embedding if it fails
        }
      }

      console.log('💾 Saving updates to MongoDB:', updates);
      console.log('👤 User ID:', req.user.userId);

      const updatedUser = await User.findByIdAndUpdate(
        req.user.userId,
        { $set: updates },
        { new: true, runValidators: true }
      ).exec();

      if (!updatedUser) {
        console.error('❌ User not found after update attempt');
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      console.log('✅ User updated successfully in MongoDB');
      console.log('📝 Updated user data:', {
        id: updatedUser._id.toString(),
        name: updatedUser.name,
        role: updatedUser.role,
        primaryGoal: updatedUser.primaryGoal,
        phoneNumber: updatedUser.phoneNumber,
      });

      // Send response immediately
      res.status(200).json({
        id: updatedUser._id.toString(),
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        primaryGoal: updatedUser.primaryGoal,
        company: updatedUser.company,
        website: updatedUser.website,
        location: updatedUser.location,
        oneLiner: updatedUser.oneLiner,
        photoUrl: updatedUser.photoUrl,
        phoneNumber: updatedUser.phoneNumber,
        createdAt: updatedUser.createdAt,
        updatedAt: updatedUser.updatedAt,
      });
    } catch (error) {
      console.error('❌ Error in PUT /me:', error);
      console.error('Error details:', {
        message: (error as Error).message,
        stack: (error as Error).stack,
      });
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update user profile",
      });
    }
  }

);

/**
 * GET /:id
 * Get user profile by ID (protected)
 */
router.get(
  "/:id",
  authMiddleware,
  cacheMiddleware(CacheTTL.LONG), // Cache for 15 minutes (profiles change rarely)
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.params.id;
      const user = await User.findById(userId).exec();

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
        primaryGoal: user.primaryGoal,
        company: user.company,
        website: user.website,
        location: user.location,
        oneLiner: user.oneLiner,
        photoUrl: user.photoUrl,
        phoneNumber: user.phoneNumber,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("Error in GET /:id:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to fetch user profile",
      });
    }
  }
);

/**
 * POST /upload-profile-image
 * Upload profile image as Base64 string (protected)
 */
router.post(
  "/upload-profile-image",
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

      const { image } = req.body;

      if (!image) {
        res.status(400).json({
          error: "Bad Request",
          message: "No image data provided",
        });
        return;
      }

      // Basic validation for Base64 string
      if (typeof image !== 'string' || !image.startsWith('data:image')) {
        res.status(400).json({
          error: "Bad Request",
          message: "Invalid image format. Must be a Base64 data URL.",
        });
        return;
      }

      // 1. Upload Base64 to S3
      let imageUrl = image;
      try {
        console.log(`📡 [PROFILE] Uploading Base64 image to S3 for user: ${userId}`);
        const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
        if (matches && matches.length === 3) {
          const contentType = matches[1];
          const buffer = Buffer.from(matches[2], 'base64');
          const extension = contentType.split('/')[1] || 'png';
          const fileName = `avatar_${userId}_${Date.now()}.${extension}`;

          imageUrl = await uploadToS3(buffer, fileName, contentType, 'profiles');
          console.log(`✅ [PROFILE] S3 URL stored: ${imageUrl}`);
        }
      } catch (err) {
        console.error("❌ [PROFILE] S3 upload failed, returning Base64", err);
        // Fallback to Base64 if S3 fails
      }

      // 2. Update user profile with new image URL
      const user = await User.findByIdAndUpdate(
        userId,
        { photoUrl: imageUrl },
        { new: true }
      ).exec();

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Profile image uploaded successfully",
        imageUrl: imageUrl, // Return the S3 URL (or Base64 fallback)
        user: {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          photoUrl: user.photoUrl,
        },
      });
    } catch (error: any) {
      console.error("Error uploading profile image:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: error.message || "Failed to upload profile image",
      });
    }
  }
);

export default router;
