import { Router, Response } from "express";
import { authMiddleware } from "../middleware/authMiddleware";
import { AuthRequest } from "../types";
import { Event } from "../models/Event";

const router = Router();

/**
 * POST /
 * Create a new event
 */
router.post(
    "/",
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

            const {
                name,
                headline,
                description,
                dateTime,
                location,
                photos,
                videos,
                tags,
            } = req.body;

            // Basic validation
            if (!name || !description || !dateTime || !location) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Missing required fields: name, description, dateTime, location",
                });
                return;
            }

            const event = await Event.create({
                name,
                headline,
                description,
                dateTime: new Date(dateTime),
                location,
                photos: photos || [],
                videos: videos || [],
                tags: tags || [],
                createdBy: req.user.userId,
            });

            res.status(201).json({
                message: "Event created successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Error creating event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: error.message || "Failed to create event",
            });
        }
    }
);

/**
 * GET /
 * Get all events
 */
router.get(
    "/",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const events = await Event.find()
                .populate("createdBy", "name photoUrl role company")
                .sort({ dateTime: 1 }); // Sort by date ascending (upcoming first)

            res.status(200).json({
                message: "Events retrieved successfully",
                data: events,
            });
        } catch (error: any) {
            console.error("Error fetching events:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch events",
            });
        }
    }
);

/**
 * GET /:id
 * Get event by ID
 */
router.get(
    "/:id",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const event = await Event.findById(id).populate(
                "createdBy",
                "name photoUrl role company"
            );

            if (!event) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            res.status(200).json({
                message: "Event retrieved successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Error fetching event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch event",
            });
        }
    }
);

/**
 * PUT /:id
 * Update event
 */
router.put(
    "/:id",
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

            const { id } = req.params;
            const updates = req.body;

            // Check ownership
            const existingEvent = await Event.findById(id);
            if (!existingEvent) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            if (existingEvent.createdBy.toString() !== req.user.userId) {
                res.status(403).json({
                    error: "Forbidden",
                    message: "You are not authorized to update this event",
                });
                return;
            }

            const event = await Event.findByIdAndUpdate(id, updates, {
                new: true,
                runValidators: true,
            });

            res.status(200).json({
                message: "Event updated successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Error updating event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to update event",
            });
        }
    }
);

/**
 * DELETE /:id
 * Delete event
 */
router.delete(
    "/:id",
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

            const { id } = req.params;

            // Check ownership
            const existingEvent = await Event.findById(id);
            if (!existingEvent) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            if (existingEvent.createdBy.toString() !== req.user.userId) {
                res.status(403).json({
                    error: "Forbidden",
                    message: "You are not authorized to delete this event",
                });
                return;
            }

            await Event.findByIdAndDelete(id);

            res.status(200).json({
                message: "Event deleted successfully",
            });
        } catch (error: any) {
            console.error("Error deleting event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to delete event",
            });
        }
    }
);

export default router;
