import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";
import { User } from "../models/User";

const router = Router();

/**
 * GET /me
 * Get current user profile (protected)
 */
router.get(
  "/me",
  authMiddleware,
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
      if (!req.user) {
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

      // Validate role if provided (REMOVED - now accepts any custom role)
      // Validate primaryGoal if provided (REMOVED - now accepts any custom goal)


      // Check if semantic fields are being updated
      const semanticFields = [
        "interests",
        "skills",
        "role",
        "primaryGoal",
        "location",
      ];
      const needsEmbeddingUpdate = semanticFields.some(
        (field) => updates[field] !== undefined
      );

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { $set: updates },
        { new: true, runValidators: true }
      ).exec();

      if (!user) {
        res.status(404).json({
          error: "Not Found",
          message: "User not found",
        });
        return;
      }

      // Send response immediately
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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });

      // Generate embedding in background if needed
      if (needsEmbeddingUpdate) {
        console.log("ℹ️ Triggering background embedding update...");
        (async () => {
          try {
            const { EmbeddingService } = await import(
              "../services/embeddingService"
            );
            const userForEmbedding = await User.findById(req.user!.userId);
            if (userForEmbedding) {
              const profileText = EmbeddingService.createUserProfileText(userForEmbedding.toObject());
              console.log("📝 Generating embedding for text:", profileText);

              if (profileText) {
                const embedding = await EmbeddingService.generateEmbedding(profileText);
                if (embedding && embedding.length > 0) {
                  await User.findByIdAndUpdate(req.user!.userId, { profileEmbedding: embedding });
                  console.log("✅ Profile embedding updated successfully");
                } else {
                  console.warn("⚠️ Generated embedding was empty");
                }
              } else {
                console.warn("⚠️ Profile text for embedding was empty");
              }
            }
          } catch (error) {
            console.error("❌ Background embedding generation failed:", error);
          }
        })();
      }
    } catch (error) {
      console.error("Error in PUT /me:", error);
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({
          error: "Internal Server Error",
          message: "Failed to update user profile",
        });
      }
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

      // Update user profile with new image URL (Base64 string)
      const user = await User.findByIdAndUpdate(
        userId,
        { photoUrl: image },
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
        imageUrl: image, // Return the Base64 string
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
