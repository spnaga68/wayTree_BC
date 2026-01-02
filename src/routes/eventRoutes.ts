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
            const sanitizedBody = { ...req.body };
            if (sanitizedBody.pdfFile) {
                sanitizedBody.pdfFile = `[Base64 PDF Data - ${sanitizedBody.pdfFile.length} chars]`;
            }
            console.log('   - Body JSON:', JSON.stringify(sanitizedBody).substring(0, 1000) + '...'); // Limit log length

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
            if (isEvent && !isCommunity && !dateTime) {
                res.status(400).json({
                    error: "Bad Request",
                    message: "Date and time are required for events",
                });
                return;
            }

            // Extract text from PDF if provided (only for events, NOT communities)
            let pdfExtractedText = '';
            if (pdfFile && isEvent && !isCommunity) {
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
            } else if (isCommunity) {
                console.log('ℹ️ Community creation detected: Skipping PDF extraction and RAG pipeline explicitly.');
            }

            // 2. RAG PIPELINE INTEGRATION (CRITICAL STEP)
            // Generate Semantic Chunks for the PDF (Only for Events)
            let pdfChunks: any[] = [];
            if (pdfFile && isEvent && !isCommunity) {
                try {
                    const { RagPipelineService } = await import("../services/ragPipelineService");
                    console.log('🤖 Triggering RAG Pipeline for PDF...');
                    pdfChunks = await RagPipelineService.processEventPdf(pdfFile);
                    console.log(`✅ RAG Pipeline finished. Generated ${pdfChunks.length} chunks.`);

                    if (pdfChunks.length === 0) {
                        console.warn("⚠️ Warning: RAG Pipeline returned 0 chunks.");
                    }
                } catch (ragError: any) {
                    console.error("❌ RAG Pipeline failed:", ragError);
                    // Continue even if RAG fails, but log it
                }
            }

            // 3. Generate Embeddings for the EVENT
            let eventEmbedding: number[] = [];
            let metadataEmbedding: number[] = [];
            try {
                const { EmbeddingService } = await import("../services/embeddingService");
                const tempEvent = {
                    name,
                    headline,
                    description,
                    tags,
                    location,
                    pdfExtractedText
                };

                const metadataText = EmbeddingService.createEventMetadataText(tempEvent);
                const eventText = EmbeddingService.createEventText(tempEvent);

                if (metadataText === eventText) {
                    // Scenario: No PDF content. Both texts are identical.
                    // Call API ONCE, store TWICE.
                    console.log(`📝 Generating Gemini embedding for: "${name}" (Single API call for both fields)`);
                    const sharedEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                    metadataEmbedding = sharedEmbedding;
                    eventEmbedding = sharedEmbedding;
                } else {
                    // Scenario: PDF exists. Texts are different.
                    // Call API TWICE.
                    console.log(`📝 Generating Gemini event embedding (incl. PDF) for: "${name}"`);
                    eventEmbedding = await EmbeddingService.generateEmbedding(eventText);

                    console.log(`📝 Generating Gemini metadata-only embedding for: "${name}"`);
                    metadataEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                }
            } catch (err) {
                console.error("❌ Failed to generate embeddings:", err);
            }

            // Create event object with EXPLICIT field assignment
            const eventDoc = new Event();
            eventDoc.attendees = [];
            eventDoc.pdfChunks = pdfChunks;
            eventDoc.metadataEmbedding = metadataEmbedding;
            eventDoc.eventEmbedding = eventEmbedding;
            eventDoc.pdfFile = pdfFile; // Store original PDF base64
            eventDoc.pdfExtractedText = pdfExtractedText; // Store extracted text
            eventDoc.isVerified = false; // Always false on creation;
            eventDoc.photos = photos || [];
            eventDoc.videos = videos || [];
            eventDoc.tags = tags || [];
            eventDoc.createdBy = new mongoose.Types.ObjectId(req.user.userId);
            eventDoc.name = name;
            eventDoc.headline = headline;
            eventDoc.description = description;
            if (dateTime) {
                eventDoc.dateTime = new Date(dateTime);
            }
            eventDoc.location = location;

            // CRITICAL: Explicitly set boolean flags
            eventDoc.isEvent = isEvent !== undefined ? Boolean(isEvent) : true;
            eventDoc.isCommunity = isCommunity !== undefined ? Boolean(isCommunity) : false;
            // eventDoc.isVerified = false; // Always false on creation - already set above

            console.log('💾 Saving Event with flags:');
            console.log('   - isEvent:', eventDoc.isEvent);
            console.log('   - isCommunity:', eventDoc.isCommunity);
            console.log('   - isVerified:', eventDoc.isVerified);

            const event = await eventDoc.save();

            console.log('✅ Event saved. Verifying fields in saved document:');
            console.log('   - Saved isEvent:', event.isEvent);
            console.log('   - Saved isCommunity:', event.isCommunity);
            console.log('   - Saved pdfFile: [REDACTED]');
            console.log('   - Saved pdfExtractedText:', event.pdfExtractedText ? `${event.pdfExtractedText.substring(0, 50)}... (${event.pdfExtractedText.length} chars)` : 'null');

            // Prepare response data (exclude large PDF data)
            const eventResponse = event.toObject();
            delete eventResponse.pdfFile;

            res.status(201).json({
                message: "Event created successfully",
                data: eventResponse,
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

            const { my, all } = req.query;
            const userId = req.user.userId;
            const userRole = req.user.role;

            const filter: any = {};

            if (all === 'true' && userRole === 'admin') {
                // Admin sees everything
            } else if (my === 'true') {
                // User sees their own events (verified or not)
                filter.createdBy = new mongoose.Types.ObjectId(userId);
            } else {
                // Default: only verified events
                filter.isVerified = true;
            }

            const User = (await import("../models/User")).User;
            const user = await User.findById(userId);

            // If it's a standard request (not 'my' or 'all'), try dual vector search
            if (!my && !all && user && user.profileEmbedding && user.profileEmbedding.length > 0) {
                console.log(`🔍 semantic dual-search for user: ${user.name}`);
                try {
                    // Search stage template
                    const getSearchStage = (path: string) => ({
                        $vectorSearch: {
                            index: "vector_index",
                            path,
                            queryVector: user.profileEmbedding,
                            numCandidates: 100,
                            limit: 20
                        }
                    });

                    // Match stage template: Global/Discovery should EXCLUDE my own events
                    const matchStage = {
                        $match: {
                            isVerified: true,
                            dateTime: { $gte: new Date() },
                            createdBy: { $ne: new mongoose.Types.ObjectId(userId) } // Exclude self
                        }
                    };

                    // Add score projection
                    const scoreStage = {
                        $addFields: {
                            score: { $meta: "vectorSearchScore" }
                        }
                    };

                    // Run parallel searches
                    const [metaResults, eventResults] = await Promise.all([
                        Event.aggregate([getSearchStage("metadataEmbedding"), matchStage, scoreStage]),
                        Event.aggregate([getSearchStage("eventEmbedding"), matchStage, scoreStage])
                    ]);

                    // Merge and deduplicate results
                    const mergedMap = new Map<string, any>();

                    [...metaResults, ...eventResults].forEach(event => {
                        const id = event._id.toString();
                        const existing = mergedMap.get(id);
                        const score = event.score || 0;
                        if (!existing || score > existing.score) {
                            mergedMap.set(id, {
                                ...event,
                                score: score,
                                // Note where we found it for debugging
                                searchOrigin: existing ? 'both' : (eventResults.includes(event) ? 'combined' : 'metadata')
                            });
                        }
                    });

                    const mergedEvents = Array.from(mergedMap.values())
                        .sort((a, b) => b.score - a.score)
                        .slice(0, 20);
                    await Event.populate(mergedEvents, { path: "createdBy", select: "name photoUrl role company" });

                    const minScore = 0.10; // LOWERED THRESHOLD AS REQUESTED

                    console.log(`🔍 Search Scores:`, mergedEvents.map((ev: any) => `${ev.name}: ${(ev.score || 0).toFixed(4)}`).join(" | "));

                    const processedEvents = mergedEvents
                        .filter((event: any) => (event.score || 0) >= minScore)
                        .map((event: any) => ({
                            ...event,
                            matchScore: Math.round((event.score || 0) * 100),
                            isJoined: event.attendees
                                ? event.attendees.some((a: any) => a.toString() === userId)
                                : false
                        }));

                    res.status(200).json({
                        message: "Events retrieved successfully (Smart Recommendations)",
                        data: processedEvents,
                    });
                    return;
                } catch (vectorError) {
                    console.error("⚠️ Dual vector search failed. Falling back.", vectorError);
                }
            }

            // Standard find for 'my', 'all', or fallback
            const events = await Event.find(filter)
                .populate("createdBy", "name photoUrl role company")
                .sort({ dateTime: 1 });

            const eventsWithData = events.map(event => ({
                ...event.toObject(),
                isJoined: event.attendees.some(a => a.toString() === userId)
            }));

            res.status(200).json({
                message: "Events retrieved successfully",
                data: eventsWithData,
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
 * GET /admin/pending
 * Get pending events for admin approval
 */
router.get(
    "/admin/pending",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                res.status(403).json({ error: "Forbidden", message: "Admin access required" });
                return;
            }

            const events = await Event.find({ isVerified: false })
                .populate("createdBy", "name photoUrl role company")
                .sort({ createdAt: -1 });

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

/**
 * PUT /admin/:id/verify
 * Approve an event
 */
router.put(
    "/admin/:id/verify",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                res.status(403).json({ error: "Forbidden", message: "Admin access required" });
                return;
            }

            const { id } = req.params;

            const baseEvent = await Event.findById(id);
            if (!baseEvent) {
                res.status(404).json({
                    error: "Not Found",
                    message: "Event not found",
                });
                return;
            }

            // 1. Process PDF for RAG if it exists but hasn't been processed
            let pdfChunks = baseEvent.pdfChunks;
            let pdfExtractedText = baseEvent.pdfExtractedText;

            // Safety check: if for some reason chunks are missing, regenerate them
            if (baseEvent.pdfFile && (!pdfChunks || pdfChunks.length === 0)) {
                try {
                    const { RagPipelineService } = await import("../services/ragPipelineService");
                    pdfChunks = await RagPipelineService.processEventPdf(baseEvent.pdfFile);

                    if (!pdfExtractedText) {
                        const { PdfService } = await import("../services/pdfService");
                        pdfExtractedText = await PdfService.extractTextFromPdf(baseEvent.pdfFile);
                    }
                } catch (ragErr) {
                    console.error("❌ Failed to process PDF during verification:", ragErr);
                }
            }

            // 2. Refresh Embeddings if missing
            let eventEmbedding = baseEvent.eventEmbedding;
            let metadataEmbedding = baseEvent.metadataEmbedding;

            try {
                const { EmbeddingService } = await import("../services/embeddingService");

                if ((!eventEmbedding || eventEmbedding.length === 0) || (!metadataEmbedding || metadataEmbedding.length === 0)) {
                    const metadataText = EmbeddingService.createEventMetadataText(baseEvent.toObject());
                    const eventText = EmbeddingService.createEventText({
                        ...baseEvent.toObject(),
                        pdfExtractedText
                    });

                    if (metadataText === eventText) {
                        const sharedEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                        eventEmbedding = sharedEmbedding;
                        metadataEmbedding = sharedEmbedding;
                    } else {
                        if (!eventEmbedding || eventEmbedding.length === 0) {
                            eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                        }
                        if (!metadataEmbedding || metadataEmbedding.length === 0) {
                            metadataEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                        }
                    }
                }
            } catch (err) {
                console.error("Failed to generate embeddings during verification:", err);
            }

            const event = await Event.findByIdAndUpdate(
                id,
                {
                    isVerified: true,
                    eventEmbedding,
                    metadataEmbedding,
                    pdfChunks,
                    pdfExtractedText
                },
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

/**
 * DELETE /admin/:id/reject
 * Reject an event (delete it)
 */
router.delete(
    "/admin/:id/reject",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user || req.user.role !== 'admin') {
                res.status(403).json({ error: "Forbidden", message: "Admin access required" });
                return;
            }

            const { id } = req.params;
            await Event.findByIdAndDelete(id);

            res.status(200).json({
                message: "Event rejected and deleted successfully",
            });
        } catch (error: any) {
            console.error("Error rejecting event:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to reject event",
            });
        }
    }
);

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

            // Dual Vector Search Aggregation
            const getSearchStage = (path: string) => ({
                $vectorSearch: {
                    index: "vector_index",
                    path,
                    queryVector: user.profileEmbedding,
                    numCandidates: 100,
                    limit: 10
                }
            });

            const matchStage = {
                $match: {
                    isVerified: true,
                    dateTime: { $gte: new Date() },
                    createdBy: { $ne: new mongoose.Types.ObjectId(req.user.userId) } // Exclude self
                }
            };

            // Parallel search with score projection
            const scoreStage = {
                $addFields: {
                    score: { $meta: "vectorSearchScore" }
                }
            };

            const [metaResults, eventResults] = await Promise.all([
                Event.aggregate([getSearchStage("metadataEmbedding"), matchStage, scoreStage]),
                Event.aggregate([getSearchStage("eventEmbedding"), matchStage, scoreStage])
            ]);

            // Merge and deduplicate
            const mergedMap = new Map<string, any>();
            [...metaResults, ...eventResults].forEach(event => {
                const id = event._id.toString();
                const existing = mergedMap.get(id);
                const score = event.score || 0;
                if (!existing || score > existing.score) {
                    mergedMap.set(id, { ...event, score });
                }
            });

            const mergedEvents = Array.from(mergedMap.values())
                .sort((a, b) => b.score - a.score)
                .slice(0, 10);

            const processedEvents = mergedEvents.map((event: any) => ({
                ...event,
                matchScore: Math.round((event.score || 0) * 100)
            }));

            console.log(`🔍 Recommendation Scores:`, processedEvents.map((ev: any) => `${ev.name}: ${ev.matchScore}%`).join(" | "));

            res.status(200).json({
                message: "Recommended events retrieved successfully",
                data: processedEvents,
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

            // 1. HANDLE PDF UPDATE
            if (updates.pdfFile) {
                try {
                    console.log('📄 UPDATE: PDF modified. Updating PDF chunks and event embedding...');
                    const { PdfService } = await import("../services/pdfService");
                    if (PdfService.isValidPdf(updates.pdfFile)) {
                        updates.pdfExtractedText = await PdfService.extractTextFromPdf(updates.pdfFile);

                        // RAG Pipeline
                        const { RagPipelineService } = await import("../services/ragPipelineService");
                        updates.pdfChunks = await RagPipelineService.processEventPdf(updates.pdfFile);

                        // Regenerate combined/PDF embedding
                        const { EmbeddingService } = await import("../services/embeddingService");
                        const eventText = EmbeddingService.createEventText({
                            ...existingEvent.toObject(),
                            ...updates
                        });
                        updates.eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                    }
                } catch (err) {
                    console.error("❌ Failed to process PDF update:", err);
                }
            }

            // 2. REGENERATE METADATA EMBEDDING IF TEXT CHANGED
            const metadataFields = ['name', 'headline', 'description', 'location', 'tags'];
            const hasMetadataChanges = metadataFields.some(field => updates[field] !== undefined);

            if (hasMetadataChanges || updates.pdfFile) {
                try {
                    const { EmbeddingService } = await import("../services/embeddingService");
                    const metadataText = EmbeddingService.createEventMetadataText({
                        ...existingEvent.toObject(),
                        ...updates
                    });
                    const eventText = EmbeddingService.createEventText({
                        ...existingEvent.toObject(),
                        ...updates
                    });

                    if (metadataText === eventText) {
                        console.log('📝 UPDATE: Metadata modified (No PDF). Regenerating shared embedding...');
                        const sharedEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                        updates.metadataEmbedding = sharedEmbedding;
                        updates.eventEmbedding = sharedEmbedding;
                    } else {
                        if (hasMetadataChanges) {
                            console.log('📝 UPDATE: Metadata modified. Regenerating metadata embedding...');
                            updates.metadataEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                        }
                        if (updates.pdfFile) {
                            console.log('📝 UPDATE: PDF modified. Regenerating event embedding...');
                            updates.eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                        }
                    }
                } catch (err) {
                    console.error("❌ Failed to regenerate embeddings during update:", err);
                }
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

            // Notify event creator
            try {
                if (event.createdBy.toString() !== userId) {
                    const { Notification } = await import("../models/Notification");
                    await Notification.create({
                        recipientId: event.createdBy,
                        actorId: userId,
                        eventId: event._id,
                        type: 'EVENT_JOIN'
                    });
                    console.log(`🔔 Notification created for user ${event.createdBy}`);
                }
            } catch (notifyError) {
                console.error("Failed to create notification:", notifyError);
                // Don't fail the join request just because notification failed
            }

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

            // Get Event Assistant Service
            const { EventAssistantService } = await import("../services/eventAssistantService");

            const response = await EventAssistantService.askEventAssistant(
                question,
                event,
                user, // Pass the Mongoose document
                conversationHistory || []
            );

            res.status(200).json({
                message: "Assistant response generated",
                data: response
            });

        } catch (error: any) {
            console.error("Error in Event Assistant:", error);
            res.status(500).json({
                error: "Internal Server Error",
                message: "Failed to get assistant response"
            });
        }
    }
);

export default router;