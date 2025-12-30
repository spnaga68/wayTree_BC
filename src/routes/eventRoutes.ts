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
            console.log('📥 POST /events (UPDATED V2) Request received');
            console.log('   - User:', req.user?.userId);
            console.log('   - Body Type:', typeof req.body);
            console.log('   - Body keys:', Object.keys(req.body));
            console.log('   - isEvent:', req.body.isEvent);
            console.log('   - isCommunity:', req.body.isCommunity);
            console.log('   - Body JSON:', JSON.stringify(req.body));

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
                isEvent,
                isCommunity,
                pdfFile, // Base64 encoded PDF (only for events)
            } = req.body;

            // Basic validation
            if (!name || !description || !location) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Missing required fields: name, description, location",
                });
                return;
            }

            // Date/time is only required for events, not communities
            if (isEvent && !dateTime) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Date and time are required for events",
                });
                return;
            }

            // Extract text from PDF if provided (only for events)
            let pdfExtractedText = '';
            if (pdfFile && isEvent) {
                try {
                    const { PdfService } = await import("../services/pdfService");

                    // Validate PDF
                    if (!PdfService.isValidPdf(pdfFile)) {
                        res.status(400).json({
                            error: "Bad Request",
                            message: "Invalid PDF file format",
                        });
                        return;
                    }

                    console.log('📄 Extracting text from PDF...');
                    pdfExtractedText = await PdfService.extractTextFromPdf(pdfFile);
                    console.log(`✅ PDF text extracted. Length: ${pdfExtractedText.length} characters`);
                } catch (err) {
                    console.error("❌ Failed to extract PDF text:", err);
                    res.status(500).json({
                        error: "Internal Server Error",
                        message: "Failed to process PDF file. Please try again."
                    });
                    return;
                }
            }

            // Generate Embedding FIRST (before saving to DB)
            // Include PDF extracted text for richer embeddings
            let eventEmbedding: number[] = [];
            try {
                const { EmbeddingService } = await import("../services/embeddingService");
                // Create a temporary object for text generation
                const tempEvent = {
                    name,
                    headline,
                    description,
                    tags,
                    location,
                    pdfExtractedText // Include PDF content in embeddings
                };
                const eventText = EmbeddingService.createEventText(tempEvent);

                if (eventText) {
                    console.log(`📝 Generating Local embedding for new event: "${name}"`);
                    eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                    console.log(`✅ Local embedding generated. Dimension: ${eventEmbedding.length}`);
                }
            } catch (err) {
                console.error("❌ Failed to generate embedding:", err);
                // Proceed without embedding if it fails
            }

            // Create event object with EXPLICIT field assignment
            const eventDoc = new Event();
            eventDoc.name = name;
            eventDoc.headline = headline;
            eventDoc.description = description;
            if (dateTime) {
                eventDoc.dateTime = new Date(dateTime);
            }
            eventDoc.location = location;
            eventDoc.photos = photos || [];
            eventDoc.videos = videos || [];
            eventDoc.tags = tags || [];
            eventDoc.createdBy = new mongoose.Types.ObjectId(req.user.userId);
            eventDoc.eventEmbedding = eventEmbedding;

            // Store PDF data (only for events)
            if (pdfFile && isEvent) {
                eventDoc.pdfFile = pdfFile;
                eventDoc.pdfExtractedText = pdfExtractedText;
            }

            // CRITICAL: Explicitly set boolean flags
            eventDoc.isEvent = isEvent !== undefined ? Boolean(isEvent) : true;
            eventDoc.isCommunity = isCommunity !== undefined ? Boolean(isCommunity) : false;
            eventDoc.isVerified = false; // Always false on creation

            console.log('💾 Saving Event with flags:');
            console.log('   - isEvent:', eventDoc.isEvent);
            console.log('   - isCommunity:', eventDoc.isCommunity);
            console.log('   - isVerified:', eventDoc.isVerified);

            const event = await eventDoc.save();

            console.log('✅ Event saved. Verifying fields in saved document:');
            console.log('   - Saved isEvent:', event.isEvent);
            console.log('   - Saved isCommunity:', event.isCommunity);
            console.log('   - Saved pdfFile:', event.pdfFile ? `${event.pdfFile.substring(0, 50)}... (${event.pdfFile.length} chars)` : 'null');
            console.log('   - Saved pdfExtractedText:', event.pdfExtractedText ? `${event.pdfExtractedText.substring(0, 50)}... (${event.pdfExtractedText.length} chars)` : 'null');

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
                    isEvent: event.isEvent,
                    isCommunity: event.isCommunity,
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
                            isEvent: 1,
                            isCommunity: 1,
                            score: { $meta: "vectorSearchScore" }
                        }
                    }
                ]);

                // Populate createdBy (since aggregate returns raw IDs)
                await Event.populate(events, { path: "createdBy", select: "name photoUrl role company" });

                // PRODUCTION-READY: Use vector scores with smart threshold
                const userId = req.user.userId;
                const minScore = 0.50; // 50% minimum match (wider range)

                const processedEvents = events
                    .filter((event: any) => event.score >= minScore) // Filter low matches
                    .map((event: any) => {
                        const matchPercentage = Math.round(event.score * 100);
                        console.log(`📊 Event: "${event.name}" | Match: ${matchPercentage}%`);

                        return {
                            ...event,
                            matchScore: matchPercentage,
                            isJoined: event.attendees
                                ? event.attendees.some((a: any) => a.toString() === userId)
                                : false
                        };
                    });

                console.log(`ℹ️ Returning ${processedEvents.length} recommended events (${minScore * 100}%+ match)`);

                res.status(200).json({
                    message: "Events retrieved successfully (Smart Recommendations)",
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
                    isEvent: event.isEvent,
                    isCommunity: event.isCommunity,
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

/**
 * POST /:id/assistant
 * Event Assistant - Ask questions about a specific event
 */
router.post(
    "/:id/assistant",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const eventId = req.params.id;
            const { question, conversationHistory } = req.body;

            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            if (!question || typeof question !== 'string') {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Question is required"
                });
                return;
            }

            // Get event details
            const event = await Event.findById(eventId)
                .populate("createdBy", "name photoUrl role company");

            if (!event) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found"
                });
                return;
            }

            // Get user profile
            const User = (await import("../models/User")).User;
            const user = await User.findById(req.user.userId);

            if (!user) {
                res.status(404).json({
                    error: "Not Found",
                    message: "User not found"
                });
                return;
            }

            console.log(`💬 Event Assistant: "${question}" about "${event.name}"`);

            // Use Event Assistant Service
            const { EventAssistantService } = await import("../services/eventAssistantService");

            const response = await EventAssistantService.askEventAssistant(
                question,
                event.toObject(),
                user.toObject(),
                conversationHistory || []
            );

            res.status(200).json({
                message: "Question answered successfully",
                data: {
                    question,
                    answer: response.answer,
                    relevantInfo: response.relevantInfo,
                    confidence: response.confidence,
                    suggestedQuestions: EventAssistantService.getSuggestedQuestions(
                        event.toObject(),
                        user.toObject()
                    )
                }
            });
        } catch (error: any) {
            console.error("Error in event assistant:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to process question"
            });
        }
    }
);

export default router;