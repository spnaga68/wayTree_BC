import { Router, Response } from "express";
import { AuthRequest } from "../types";
import { Following } from "../models/Following";
import { User } from "../models/User";
import { authMiddleware } from "../middleware/authMiddleware";
import mongoose from "mongoose";

const router = Router();

/**
 * POST /followings/follow/:userId
 * Follow a user
 */
router.post(
    "/follow/:userId",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
        try {
            const followerId = req.user?.userId;
            const { userId: followingId } = req.params;

            if (!followerId) {
                res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
                return;
            }

            if (followerId === followingId) {
                res.status(400).json({ error: "Bad Request", message: "You cannot follow yourself" });
                return;
            }

            // Check if user exists
            const userToFollow = await User.findById(followingId);
            if (!userToFollow) {
                res.status(404).json({ error: "Not Found", message: "User to follow not found" });
                return;
            }

            // Check if already following
            const existingFollow = await Following.findOne({
                followerId: new mongoose.Types.ObjectId(followerId),
                followingId: new mongoose.Types.ObjectId(followingId),
            });

            if (existingFollow) {
                res.status(409).json({ error: "Conflict", message: "You are already following this user" });
                return;
            }

            await Following.create({
                followerId: new mongoose.Types.ObjectId(followerId),
                followingId: new mongoose.Types.ObjectId(followingId),
            });

            res.status(201).json({ message: "Successfully followed user" });
        } catch (error) {
            console.error("Error following user:", error);
            res.status(500).json({ error: "Internal Server Error", message: "Failed to follow user" });
        }
    }
);

/**
 * DELETE /followings/unfollow/:userId
 * Unfollow a user
 */
router.delete(
    "/unfollow/:userId",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
        try {
            const followerId = req.user?.userId;
            const { userId: followingId } = req.params;

            if (!followerId) {
                res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
                return;
            }

            const result = await Following.findOneAndDelete({
                followerId: new mongoose.Types.ObjectId(followerId),
                followingId: new mongoose.Types.ObjectId(followingId),
            });

            if (!result) {
                res.status(404).json({ error: "Not Found", message: "You are not following this user" });
                return;
            }

            res.json({ message: "Successfully unfollowed user" });
        } catch (error) {
            console.error("Error unfollowing user:", error);
            res.status(500).json({ error: "Internal Server Error", message: "Failed to unfollow user" });
        }
    }
);

/**
 * GET /followings
 * Get users that the current user is following
 */
router.get(
    "/",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
                return;
            }

            const followings = await Following.find({ followerId: new mongoose.Types.ObjectId(userId) })
                .populate("followingId", "name email role company location photoUrl headline")
                .sort({ createdAt: -1 });

            const formattedFollowings = followings.map(f => {
                const followedUser = f.followingId as any;
                return {
                    id: f._id,
                    followingId: followedUser._id,
                    label: followedUser.name,
                    role: followedUser.role,
                    type: f.type,
                    tags: f.tags,
                    photoUrl: followedUser.photoUrl,
                };
            });

            res.json({
                message: "Followings retrieved successfully",
                count: formattedFollowings.length,
                data: formattedFollowings,
            });
        } catch (error) {
            console.error("Error fetching followings:", error);
            res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch followings" });
        }
    }
);

/**
 * GET /followings/followers
 * Get users that are following the current user
 */
router.get(
    "/followers",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user?.userId;

            if (!userId) {
                res.status(401).json({ error: "Unauthorized", message: "User not authenticated" });
                return;
            }

            const followers = await Following.find({ followingId: new mongoose.Types.ObjectId(userId) })
                .populate("followerId", "name email role company location photoUrl headline")
                .sort({ createdAt: -1 });

            const formattedFollowers = followers.map(f => f.followerId);

            res.json({
                message: "Followers retrieved successfully",
                count: formattedFollowers.length,
                data: formattedFollowers,
            });
        } catch (error) {
            console.error("Error fetching followers:", error);
            res.status(500).json({ error: "Internal Server Error", message: "Failed to fetch followers" });
        }
    }
);

export default router;
