import { Router, Response } from "express";
import mongoose from "mongoose";
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
            console.log('📥 POST /events Request received');
            console.log('   - User:', req.user?.userId);
            console.log('   - Body:', JSON.stringify(req.body));

            if (!req.user) {
                console.log('❌ Unauthorized: No user');
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

            // Generate Embedding FIRST (before saving to DB)
            let eventEmbedding: number[] = [];
            try {
                const { EmbeddingService } = await import("../services/embeddingService");
                // Create a temporary object for text generation
                const tempEvent = { name, headline, description, tags, location };
                const eventText = EmbeddingService.createEventText(tempEvent);

                if (eventText) {
                    console.log(`📝 Generating embedding for new event: "${name}"`);
                    eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                    console.log(`✅ Embedding generated. Dimension: ${eventEmbedding.length}`);
                }
            } catch (err) {
                console.error("❌ Failed to generate embedding:", err);
                res.status(500).json({
                    error: "Internal Server Error",
                    message: "Failed to generate AI embedding for event. Please try again."
                });
                return; // Stop execution if embedding fails (per user request)
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
                eventEmbedding: eventEmbedding // Store immediately
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
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            const User = (await import("../models/User")).User;
            const user = await User.findById(req.user.userId);

            // 1. STANDARD FALLBACK: If no embedding, return chronological list
            if (!user || !user.profileEmbedding || user.profileEmbedding.length === 0) {
                console.log("ℹ️ No profile embedding found. Returning standard event list.");
                const events = await Event.find({ isVerified: true })
                    .populate("createdBy", "name photoUrl role company")
                    .sort({ dateTime: 1 });

                // Add isJoined logic
                const userId = req.user.userId;
                const eventsWithData = events.map(event => ({
                    ...event.toObject(),
                    isJoined: event.attendees.some(a => a.toString() === userId)
                }));

                res.status(200).json({
                    message: "Events retrieved successfully (Standard)",
                    data: eventsWithData,
                });
                return;
            }

            // 2. VECTOR SEARCH: If embedding exists, return personalized list
            console.log(`🔍 semantic search for user: ${user.name} (${user.role})`);

            try {
                const events = await Event.aggregate([
                    {
                        $vectorSearch: {
                            index: "vector_index",
                            path: "eventEmbedding",
                            queryVector: user.profileEmbedding,
                            numCandidates: 100, // Search pool
                            limit: 20           // Return top 20 relevant
                        }
                    },
                    {
                        $match: {
                            isVerified: true,
                            dateTime: { $gte: new Date() }
                        }
                    },
                    {
                        $project: {
                            name: 1,
                            location: 1,
                            description: 1,
                            dateTime: 1,
                            headline: 1,
                            photos: 1,
                            tags: 1,
                            isVerified: 1,
                            createdBy: 1,
                            attendees: 1,
                            score: { $meta: "vectorSearchScore" }
                        }
                    }
                ]);

                // Populate createdBy (since aggregate returns raw IDs)
                await Event.populate(events, { path: "createdBy", select: "name photoUrl role company" });

                // Post-processing: Log scores & Add isJoined
                const userId = req.user.userId;

                const processedEvents = events
                    .map((event: any) => {
                        // Log all events with their scores
                        console.log(`📊 Event: "${event.name}" | Score: ${event.score.toFixed(4)}`);

                        return {
                            ...event,
                            isJoined: event.attendees
                                ? event.attendees.some((a: any) => a.toString() === userId)
                                : false
                        };
                    });

                console.log(`ℹ️ Returning ${processedEvents.length} events sorted by relevance score (descending)`);

                res.status(200).json({
                    message: "Events retrieved successfully (Personalized)",
                    data: processedEvents,
                });
            } catch (vectorError) {
                console.error("⚠️ Vector search failed (likely missing index). Falling back to standard list.", vectorError);

                // FALLBACK Logic duplicated here
                const events = await Event.find({ isVerified: true })
                    .populate("createdBy", "name photoUrl role company")
                    .sort({ dateTime: 1 });

                const userId = req.user.userId;
                const eventsWithData = events.map(event => ({
                    ...event.toObject(),
                    isJoined: event.attendees.some(a => a.toString() === userId)
                }));

                res.status(200).json({
                    message: "Events retrieved successfully (Standard Fallback)",
                    data: eventsWithData,
                });
            }

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

            // Add isJoined field for current user
            const userId = req.user?.userId;
            const eventObj: any = event.toObject();
            eventObj.isJoined = userId
                ? event.attendees.some(attendee => attendee.toString() === userId)
                : false;

            res.status(200).json({
                message: "Event retrieved successfully",
                data: eventObj,
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

/**
 * GET /admin/pending
 * Get pending events for admin approval
 */
/*
router.get(
    "/admin/pending",
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            // In a real app, add middleware to check if user is admin
            const events = await Event.find({ isVerified: false })
                .populate("createdBy", "name photoUrl role company")
                .sort({ createdAt: -1 }); // Newest first

            res.status(200).json({
                message: "Pending events retrieved successfully",
                data: events,
            });
        } catch (error: any) {
            console.error("Error fetching pending events:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch pending events",
            });
        }
    }
);
*/

/**
 * PUT /admin/:id/verify
 * Approve an event
 */
/*
router.put(
    "/admin/:id/verify",
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;

            const baseEvent = await Event.findById(id);
            if (!baseEvent) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            // Generate Embedding on verification
            let eventEmbedding: number[] = [];
            try {
                const { EmbeddingService } = await import("../services/embeddingService");
                const eventText = EmbeddingService.createEventText(baseEvent);
                if (eventText) {
                    eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                }
            } catch (err) {
                console.error("Failed to generate embedding for event:", err);
            }

            const event = await Event.findByIdAndUpdate(
                id,
                { isVerified: true, eventEmbedding },
                { new: true }
            );

            res.status(200).json({
                message: "Event verified successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Error verifying event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to verify event",
            });
        }
    }
);
*/

/**
 * GET /recommendations
 * Get recommended events based on user profile
 */
router.get(
    "/recommendations",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            const User = (await import("../models/User")).User;
            const user = await User.findById(req.user.userId);

            if (!user || !user.profileEmbedding || user.profileEmbedding.length === 0) {
                // Fallback to latest events if no embedding
                const events = await Event.find({
                    isVerified: true,
                    dateTime: { $gte: new Date() }
                })
                    .sort({ dateTime: 1 })
                    .limit(10);

                res.status(200).json({ message: "Fallback to latest events", data: events });
                return;
            }

            // Vector Search Aggregation
            const events = await Event.aggregate([
                {
                    $vectorSearch: {
                        index: "vector_index", // Ensure this matches Atlas config
                        path: "eventEmbedding",
                        queryVector: user.profileEmbedding,
                        numCandidates: 100,
                        limit: 10
                    }
                },
                {
                    $match: {
                        isVerified: true,
                        dateTime: { $gte: new Date() }
                    }
                },
                {
                    $project: {
                        name: 1,
                        location: 1,
                        description: 1,
                        dateTime: 1,
                        headline: 1,
                        photos: 1,
                        tags: 1,
                        isVerified: 1,
                        createdBy: 1,
                        attendees: 1,
                        score: { $meta: "vectorSearchScore" }
                    }
                }
            ]);

            console.log(`\n🔍 Recommendation Results for User: ${user.name}`);
            console.log("=========================================");
            if (events.length === 0) {
                console.log("ℹ️ No relevant events found.");
            } else {
                events.forEach((event: any, index: number) => {
                    const isRelevant = event.score > 0.6; // Threshold for explicit relevance logging
                    const status = isRelevant ? "✅ RELEVANT" : "⚠️ LOW RELEVANCE";

                    console.log(`\nEvent #${index + 1}: ${event.name}`);
                    console.log(`   📍 Location: ${event.location}`);
                    console.log(`   ★ Score: ${event.score.toFixed(4)}`);
                    console.log(`   🏷️ Status: ${status}`);
                });
            }
            console.log("=========================================\n");

            res.status(200).json({
                message: "Recommended events retrieved successfully",
                data: events,
            });

        } catch (error: any) {
            console.error("Error fetching recommendations:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to fetch recommendations",
            });
        }
    }
);

/**
 * POST /:id/join
 * Join an event
 */
router.post(
    "/:id/join",
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
            const userId = req.user.userId;

            const event = await Event.findById(id);
            if (!event) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            // Check if already joined
            if (event.attendees.some((attendee) => attendee.toString() === userId)) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "You have already joined this event",
                });
                return;
            }

            // Add user to attendees
            event.attendees.push(new mongoose.Types.ObjectId(userId));
            await event.save();

            res.status(200).json({
                message: "Joined event successfully",
                data: event,
            });
        } catch (error: any) {
            console.error("Error joining event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to join event",
            });
        }
    }
);
export default router;