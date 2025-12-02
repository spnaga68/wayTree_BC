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
      ];

      // Filter out fields that are not allowed
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      // Validate role if provided
      if (updates.role) {
        const validRoles = [
          "founder",
          "investor",
          "mentor",
          "cxo",
          "service",
          "other",
        ];
        if (!validRoles.includes(updates.role)) {
          res.status(400).json({
            error: "Bad Request",
            message: `Invalid role. Must be one of: ${validRoles.join(", ")}`,
          });
          return;
        }
      }

      // Validate primaryGoal if provided
      if (updates.primaryGoal) {
        const validGoals = [
          "fundraising",
          "clients",
          "cofounder",
          "hiring",
          "learn",
          "other",
        ];
        if (!validGoals.includes(updates.primaryGoal)) {
          res.status(400).json({
            error: "Bad Request",
            message: `Invalid primaryGoal. Must be one of: ${validGoals.join(
              ", "
            )}`,
          });
          return;
        }
      }

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
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      });
    } catch (error) {
      console.error("Error in PUT /me:", error);
      res.status(500).json({
        error: "Internal Server Error",
        message: "Failed to update user profile",
      });
    }
  }
);

export default router;
