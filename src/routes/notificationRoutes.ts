import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";
import { Notification } from "../models/Notification";

const router = Router();

// GET /notifications
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        const notifications = await Notification.find({
            recipientId: req.user.userId,
            isRead: false, // Only show unread? Or show all Active? Previous logic was isDismissed: false. 
            isDismissed: false
        })
            .sort({ createdAt: -1 })
            .populate("actorId", "name photoUrl")
            .populate("eventId", "name");

        res.status(200).json({ data: notifications });
        return;
    } catch (error) {
        console.error("Error fetching notifications:", error);
        res.status(500).json({ error: "Internal Server Error" });
        return;
    }
});

// PATCH /notifications/:id/dismiss
router.patch("/:id/dismiss", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        await Notification.findByIdAndUpdate(id, { isDismissed: true });
        res.status(200).json({ message: "Dismissed" });
    } catch (error) {
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;
