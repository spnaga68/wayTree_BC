import { Router, Response } from "express";
import cacheService from "../services/cacheService"; // Import CacheService
import mongoose from "mongoose";
import { authMiddleware } from "../middleware/authMiddleware";
import { cacheMiddleware, invalidateCache } from "../middleware/cacheMiddleware";
const { CacheTTL } = require("../services/cacheService");
import { AuthRequest } from "../types";
import { Event } from "../models/Event";
import { uploadToS3, deleteMultipleFromS3 } from "../services/s3Service";

const router = Router();

// Invalidate cache on all mutations (POST, PUT, DELETE)
router.use(invalidateCache('route:/api/events'));

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
            // Removed duplicate logging and variable declaration
            if (sanitizedBody.pdfFiles && Array.isArray(sanitizedBody.pdfFiles)) {
                sanitizedBody.pdfFiles = sanitizedBody.pdfFiles.map((p: string, idx: number) =>
                    `[PDF #${idx}]Length: ${p.length} chars.Start: ${p.substring(0, 50)}...`
                );
            }
            console.log('   - Body JSON:', JSON.stringify(sanitizedBody).substring(0, 2000)); // Increased log length

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
                pdfFiles, // Array of Base64 encoded PDFs
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

            // 0. HANDLE IMAGE UPLOADS TO S3
            const s3PhotoUrls: string[] = [];
            if (photos && Array.isArray(photos)) {
                for (let i = 0; i < photos.length; i++) {
                    const img = photos[i];
                    if (img.startsWith('data:image')) {
                        try {
                            const matches = img.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                            if (matches && matches.length === 3) {
                                const contentType = matches[1];
                                const buffer = Buffer.from(matches[2], 'base64');
                                const extension = contentType.split('/')[1] || 'png';
                                const fileName = `event_${req.user?.userId}_${Date.now()}_${i}.${extension} `;

                                console.log(`📡[EVENT] Uploading photo ${i + 1}/${photos.length} to S3...`);
                                const url = await uploadToS3(buffer, fileName, contentType, 'events');
                                s3PhotoUrls.push(url);
                            }
                        } catch (err) {
                            console.error(`❌ [EVENT] Photo upload ${i} failed:`, err);
                            s3PhotoUrls.push(img); // Fallback to Base64
                        }
                    } else {
                        s3PhotoUrls.push(img); // Already a URL or other format
                    }
                }
            }

            // 1. HANDLE PDF UPLOADS TO S3 (OR URL PASSTHROUGH)
            const s3PdfUrls: string[] = [];
            if (pdfFiles && Array.isArray(pdfFiles) && pdfFiles.length > 0) {
                console.log(`Processing ${pdfFiles.length} PDF items...`);
                for (let i = 0; i < pdfFiles.length; i++) {
                    const pdfData = pdfFiles[i];
                    console.log(`   - [PDF #${i}] Raw length: ${pdfData.length}`);

                    // Case A: Already a URL
                    if (pdfData.startsWith('http://') || pdfData.startsWith('https://')) {
                        console.log(`   - [PDF #${i}] Detected as URL: ${pdfData}`);
                        s3PdfUrls.push(pdfData);
                        continue;
                    }

                    // Case B: Base64 (Legacy)
                    try {
                        let base64Content = pdfData;
                        const matches = pdfData.match(/^data:application\/pdf;base64,(.+)$/);
                        if (matches) {
                            console.log(`   - [PDF #${i}] Detected data URI scheme. Extracting content.`);
                            base64Content = matches[1];
                        } else {
                            console.log(`   - [PDF #${i}] No data URI scheme found. Assuming raw Base64.`);
                        }

                        const buffer = Buffer.from(base64Content, 'base64');
                        console.log(`   - [PDF #${i}] Buffer created. Size: ${buffer.length} bytes`);

                        const fileName = `event_doc_${req.user?.userId}_${Date.now()}_${i}.pdf`;

                        console.log(`📡 [EVENT] Uploading PDF ${i + 1}/${pdfFiles.length} to S3... Filename: ${fileName}`);
                        const url = await uploadToS3(buffer, fileName, 'application/pdf', 'documents');
                        console.log(`✅ [EVENT] PDF Uploaded: ${url}`);
                        s3PdfUrls.push(url);
                    } catch (uploadErr) {
                        console.error(`❌ [EVENT] PDF upload ${i} failed:`, uploadErr);
                        // Do not push fallback garbage if it fails, just skip or maybe push original if short
                        if (pdfData.length < 500) {
                            console.warn(`   - Keeping original short data as fallback.`);
                            s3PdfUrls.push(pdfData);
                        } else {
                            console.warn(`   - Data too large to keep as fallback. Skipping.`);
                        }
                    }
                }
            } else {
                console.log('No PDF files found in request.');
            }

            // Create event object without embeddings/chunks
            const eventDoc = new Event();
            eventDoc.attendees = [];
            eventDoc.pdfFiles = s3PdfUrls;
            eventDoc.isVerified = false; // Always starts unverified for cost saving
            eventDoc.photos = s3PhotoUrls;
            eventDoc.videos = videos || [];
            eventDoc.tags = tags || [];
            eventDoc.createdBy = new mongoose.Types.ObjectId(req.user.userId);
            eventDoc.name = name;
            eventDoc.headline = headline;
            eventDoc.description = description;
            if (dateTime) eventDoc.dateTime = new Date(dateTime);
            eventDoc.location = location;
            eventDoc.isEvent = isEvent !== undefined ? Boolean(isEvent) : true;
            eventDoc.isCommunity = isCommunity !== undefined ? Boolean(isCommunity) : false;
            eventDoc.isAdmin = false; // Explicitly mark as NOT admin created

            console.log(`💾 [EVENT] Saving unverified event: ${name}. Pipeline will trigger on admin approval.`);
            const event = await eventDoc.save();

            // Invalidate Cache (New event affects lists)
            await cacheService.invalidateEventLists(); // Invalidate lists

            const eventResponse = event.toObject();
            delete eventResponse.pdfFiles; // Privacy/Size

            res.status(201).json({
                message: "Event created successfully (Pending Admin Approval)",
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
 * POST /not-interested
 * Mark an event as Not Interested
 */
router.post(
    "/not-interested",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            console.log('📥 POST /events/not-interested request');
            const { eventId } = req.body;
            console.log('   - eventId:', eventId);

            if (!eventId) {
                res.status(400).json({ error: "Missing eventId" });
                return;
            }
            const userId = req.user!.userId;
            console.log('   - userId:', userId);

            // Cast IDs to ensure strict ObjectId usage
            const eventObjectId = new mongoose.Types.ObjectId(eventId);
            const userObjectId = new mongoose.Types.ObjectId(userId);

            // Optimization: checking if event exists
            const event = await Event.findById(eventObjectId);
            if (!event) {
                console.log('   ❌ Event not found');
                res.status(404).json({ error: "Event not found" });
                return;
            }

            // Verify DB Connection
            console.log('   🔌 DB Connection:', mongoose.connection.name, 'Host:', mongoose.connection.host);

            const { NotInterested } = await import("../models/NotInterested");
            console.log('   📂 Using Collection:', NotInterested.collection.name);

            // Check existing
            let distinctRecord = await NotInterested.findOne({ eventId: eventObjectId, userId: userObjectId });

            if (distinctRecord) {
                console.log('   ⚠️ Record already exists, updating timestamp.');
                distinctRecord.createdAt = new Date();
                await distinctRecord.save();
            } else {
                console.log('   🆕 Creating NEW NotInterested record...');
                const newRecord = new NotInterested({
                    eventId: eventObjectId,
                    userId: userObjectId,
                    eventOwnerId: event.createdBy,
                    createdAt: new Date()
                });
                distinctRecord = await newRecord.save();
                console.log('   ✅ SAVED to Database Result:', distinctRecord);
            }

            // Invalidate Cache so listing updates
            await cacheService.invalidateEventLists();

            res.status(200).json({ message: "Marked as not interested", debug: distinctRecord });
        } catch (error) {
            console.error("Error marking not interested:", error);
            res.status(500).json({ error: "Internal Server Error" });
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
    cacheMiddleware(CacheTTL.MEDIUM), // Cache for 5 minutes
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }

            const { my, all } = req.query;
            const userId = req.user.userId;
            const userRole = req.user.role;

            // 1. Fetch Not Interested list
            const { NotInterested } = await import("../models/NotInterested");
            const notInterestedList = await NotInterested.find({ userId }, 'eventId');
            const excludedIds = notInterestedList.map(ni => ni.eventId);

            const filter: any = {};

            // Apply exclusion if NOT fetching 'my' events
            if (!my && excludedIds.length > 0) {
                filter._id = { $nin: excludedIds };
            }

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
                            queryVector: user.profileEmbedding as number[],
                            numCandidates: 100,
                            limit: 20
                        }
                    });

                    // Match stage template: Global/Discovery should EXCLUDE my own events AND Not Interested events
                    const matchQuery: any = {
                        isVerified: true,
                        dateTime: { $gte: new Date() },
                        createdBy: { $ne: new mongoose.Types.ObjectId(userId) } // Exclude self
                    };

                    if (excludedIds.length > 0) {
                        matchQuery._id = {
                            $nin: excludedIds.map(id => new mongoose.Types.ObjectId(id.toString()))
                        };
                    }

                    const matchStage = {
                        $match: matchQuery
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
 * Approve an event & Trigger RAG Pipeline (App Backend Port)
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
            console.log(`🎯 [APP-ADMIN] Approving event: ${id}`);

            const baseEvent = await Event.findById(id);
            if (!baseEvent) {
                res.status(404).json({ error: "Not Found", message: "Event not found" });
                return;
            }

            // 1. PDF & RAG PIPELINE
            let pdfChunks = baseEvent.pdfChunks || [];
            let pdfExtractedTexts = baseEvent.pdfExtractedTexts || [];

            if (baseEvent.pdfFiles && baseEvent.pdfFiles.length > 0) {
                try {
                    const { PdfService } = await import("../services/pdfService");
                    const { RagPipelineService } = await import("../services/ragPipelineService");

                    console.log('📄 [APP-ADMIN] Processing PDFs for chunks/text...');
                    const extracted: string[] = [];
                    for (const pdf of baseEvent.pdfFiles) {
                        if (PdfService.isValidPdf(pdf)) {
                            extracted.push(await PdfService.extractTextFromPdf(pdf));
                        }
                    }
                    pdfExtractedTexts = extracted;
                    pdfChunks = await RagPipelineService.processMultiplePdfs(baseEvent.pdfFiles);
                } catch (ragErr) {
                    console.error("❌ [APP-ADMIN] RAG Processing failed:", ragErr);
                }
            }

            // 2. REFRESH EMBEDDINGS (Gemini)
            let eventEmbedding = baseEvent.eventEmbedding;
            let metadataEmbedding = baseEvent.metadataEmbedding;

            try {
                const { EmbeddingService } = await import("../services/embeddingService");
                const tempObj = { ...baseEvent.toObject(), pdfExtractedTexts };
                const metadataText = EmbeddingService.createEventMetadataText(tempObj);
                const eventText = EmbeddingService.createEventText(tempObj);

                if (metadataText === eventText) {
                    const shared = await EmbeddingService.generateEmbedding(metadataText);
                    eventEmbedding = shared;
                    metadataEmbedding = shared;
                } else {
                    eventEmbedding = await EmbeddingService.generateEmbedding(eventText);
                    metadataEmbedding = await EmbeddingService.generateEmbedding(metadataText);
                }
            } catch (embErr) {
                console.error("❌ [APP-ADMIN] Embedding failed:", embErr);
            }

            const event = await Event.findByIdAndUpdate(
                id,
                {
                    isVerified: true,
                    eventEmbedding,
                    metadataEmbedding,
                    pdfChunks,
                    pdfExtractedTexts,
                    isActive: true
                },
                { new: true }
            );

            // Invalidate Cache
            await cacheService.invalidateEventLists();

            res.status(200).json({
                message: "Event verified and semantic pipeline processed",
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

            // Invalidate Cache
            await cacheService.invalidateEventLists();

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
                    queryVector: user.profileEmbedding as number[],
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

            // Handle media deletions from S3
            const deletedPhotos = updates.deletedPhotos || [];
            const deletedPdfs = updates.deletedPdfs || [];
            const deletedVideos = updates.deletedVideos || [];
            const allDeletions = [...deletedPhotos, ...deletedPdfs, ...deletedVideos];

            if (allDeletions.length > 0) {
                console.log(`🗑️  [EVENT UPDATE] Deleting ${allDeletions.length} files from S3...`);
                try {
                    await deleteMultipleFromS3(allDeletions);
                } catch (err) {
                    console.error('❌ [EVENT UPDATE] S3 deletion failed:', err);
                    // Continue anyway - MongoDB will be updated
                }
            }

            // Remove deletion arrays from updates
            delete updates.deletedPhotos;
            delete updates.deletedPdfs;
            delete updates.deletedVideos;

            // 0. HANDLE IMAGE UPLOADS TO S3 (For Updates)
            if (updates.photos && Array.isArray(updates.photos)) {
                const s3PhotoUrls: string[] = [];
                for (let i = 0; i < updates.photos.length; i++) {
                    const img = updates.photos[i];
                    if (img.startsWith('data:image')) {
                        try {
                            const matches = img.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                            if (matches && matches.length === 3) {
                                const contentType = matches[1];
                                const buffer = Buffer.from(matches[2], 'base64');
                                const extension = contentType.split('/')[1] || 'png';
                                const fileName = `event_${req.user?.userId}_${Date.now()}_update_${i}.${extension}`;

                                console.log(`📡 [EVENT UPDATE] Uploading photo ${i + 1}/${updates.photos.length} to S3...`);
                                const url = await uploadToS3(buffer, fileName, contentType, 'events', id, 'images');
                                s3PhotoUrls.push(url);
                            } else {
                                s3PhotoUrls.push(img); // Fallback if match fails
                            }
                        } catch (err) {
                            console.error(`❌ [EVENT UPDATE] Photo upload ${i} failed:`, err);
                            s3PhotoUrls.push(img); // Fallback
                        }
                    } else {
                        // Existing URL
                        s3PhotoUrls.push(img);
                    }
                }
                updates.photos = s3PhotoUrls;
            }

            // 1. HANDLE PDF UPLOADS TO S3 (For Updates)
            if (updates.pdfFiles && Array.isArray(updates.pdfFiles)) {
                console.log(`[UPDATE] Processing ${updates.pdfFiles.length} PDF items...`);
                const s3PdfUrls: string[] = [];
                for (let i = 0; i < updates.pdfFiles.length; i++) {
                    const pdfItem = updates.pdfFiles[i];
                    if (pdfItem.startsWith('data:')) {
                        try {
                            const matches = pdfItem.match(/^data:application\/pdf;base64,(.+)$/);
                            const base64Content = matches ? matches[1] : pdfItem;
                            const buffer = Buffer.from(base64Content, 'base64');
                            const fileName = `event_doc_${req.user?.userId}_${Date.now()}_update_${i}.pdf`;

                            console.log(`📡 [EVENT UPDATE] Uploading PDF ${i + 1}/${updates.pdfFiles.length} to S3...`);
                            const url = await uploadToS3(buffer, fileName, 'application/pdf', 'documents', id, 'pdfs');
                            console.log(`✅ [EVENT UPDATE] PDF Uploaded: ${url}`);
                            s3PdfUrls.push(url);
                        } catch (uploadErr) {
                            console.error(`❌ [EVENT UPDATE] PDF upload ${i} failed:`, uploadErr);
                            // If upload fails, we can't really do much. Pushing base64 is bad, but keeping strict typing?
                            // Let's omit failed uploads or push as is.
                            s3PdfUrls.push(pdfItem.substring(0, 100)); // Fallback placeholder to fail gracefully
                        }
                    } else {
                        // Existing URL
                        console.log(`   - [UPDATE] Keeping existing/url PDF: ${pdfItem}`);
                        s3PdfUrls.push(pdfItem);
                    }
                }
                updates.pdfFiles = s3PdfUrls;
            }

            // 1. CHECK IF PDFs CHANGED
            let pdfsChanged = false;
            if (updates.pdfFiles) {
                // If the array length differs, or any content differs
                const currentPdfs = existingEvent.pdfFiles || [];
                const newPdfs = updates.pdfFiles;

                if (currentPdfs.length !== newPdfs.length) {
                    pdfsChanged = true;
                } else {
                    // Check for different URL
                    for (let i = 0; i < newPdfs.length; i++) {
                        if (newPdfs[i] !== currentPdfs[i]) {
                            pdfsChanged = true;
                            break;
                        }
                    }
                }
            }

            // 2. HANDLE PDF UPDATE (ONLY IF CHANGED)
            // 2. HANDLE PDF UPDATE (ONLY IF CHANGED)
            if (pdfsChanged) {
                // We do NOT run extraction here anymore. Admin backend handles it.
                // Just clear the old extracted data so it's inconsistent until verified.
                console.log(`📄 UPDATE: PDFs changed. Clearing old extracted data. Pipeline will run on Admin Verify.`);
                updates.pdfExtractedTexts = [];
                updates.pdfChunks = [];

                // Also clear embeddings as they are now stale
                updates.eventEmbedding = [];
                updates.metadataEmbedding = [];
            } else {
                // Even if PDFs didn't change, if metadata changed, embeddings are stale.
                // But for now, we can leave them OR clear them. 
                // Safest is to leave them if only metadata changed, but admin will overwrite anyway.
                // However, "isVerified: false" will hide it solely based on that flag.

                // Let's NOT clear if unchanged, just in case they revert edit?
                // Actually, standard flow: Edit -> Unverified -> Admin Verify -> New Embeddings.
            }

            // 3. EMBEDDINGS ARE HANDLED BY ADMIN BACKEND ONLY
            // App backend does NOT generate event/community embeddings
            // Only admin backend generates embeddings after verification
            // This saves API costs and ensures only verified events are searchable

            // 3. FORCE RE-VERIFICATION ON EDIT
            // Any update to content requires admin to re-verify
            updates.isVerified = false;
            console.log('🔒 Update detected. Resetting isVerified to false.');

            const event = await Event.findByIdAndUpdate(id, updates, {
                new: true,
                runValidators: true,
            });

            // Invalidate Cache
            await cacheService.invalidateEventLists();

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
 * PUT /:id/toggle-members-public
 * Toggle members visibility
 */
router.put(
    "/:id/toggle-members-public",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            if (!req.user) {
                res.status(401).json({ error: "Unauthorized" });
                return;
            }
            const { id } = req.params;

            const event = await Event.findById(id);
            if (!event) {
                res.status(404).json({ error: "Not Found" });
                return;
            }

            // Check ownership
            if (event.createdBy.toString() !== req.user.userId && req.user.role !== 'admin') {
                res.status(403).json({ error: "Forbidden", message: "Only creator can toggle visibility" });
                return;
            }

            // Toggle
            event.isMembersPublic = !event.isMembersPublic;
            await event.save();

            console.log(`👁️ Toggled members visibility for event ${id} to ${event.isMembersPublic}`);

            // Invalidate Cache
            await cacheService.invalidateEventLists();

            res.json({
                success: true,
                message: `Members are now ${event.isMembersPublic ? 'Public' : 'Private'}`,
                isMembersPublic: event.isMembersPublic
            });
        } catch (error: any) {
            console.error("Error toggling members visibility:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

/**
 * POST /:id/members/search
 * Intent Detection: Search members by semantic query (e.g. "Find investors")
 */
router.post(
    "/:id/members/search",
    authMiddleware,
    async (req: AuthRequest, res: Response): Promise<void> => {
        try {
            const { id } = req.params;
            const { query } = req.body;

            if (!query || typeof query !== 'string') {
                res.status(400).json({ error: "Query string is required" });
                return;
            }

            console.log(`🔍 Member Search for Event ${id}: "${query}"`);

            // 1. Fetch Event Attendees
            const event = await Event.findById(id).select('attendees');
            if (!event) {
                res.status(404).json({ error: "Event not found" });
                return;
            }

            if (!event.attendees || event.attendees.length === 0) {
                res.status(200).json({ data: [] });
                return;
            }

            // 2. Generate Query Embedding
            const { EmbeddingService } = await import("../services/embeddingService");
            const queryVector = await EmbeddingService.generateEmbedding(query);

            if (!queryVector || queryVector.length === 0) {
                res.status(500).json({ error: "Failed to generate embedding" });
                return;
            }

            // 3. Fetch Member Profiles
            const { User } = await import("../models/User");
            const members = await User.find({
                _id: { $in: event.attendees },
                profileEmbedding: { $exists: true, $ne: [] } // Must have embedding
            }).select('name oneLiner role phoneNumber profileEmbedding');

            // 4. Compute Similarity & Filter
            const cosineSimilarity = (vecA: number[], vecB: number[]) => {
                let dotProduct = 0.0;
                let normA = 0.0;
                let normB = 0.0;
                for (let i = 0; i < vecA.length; i++) {
                    dotProduct += vecA[i] * vecB[i];
                    normA += vecA[i] * vecA[i];
                    normB += vecB[i] * vecB[i];
                }
                if (normA === 0 || normB === 0) return 0;
                return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
            };

            const THRESHOLD = 0.35; // Similarity threshold

            const results = members
                .map(member => {
                    const score = cosineSimilarity(queryVector, member.profileEmbedding || []);
                    return {
                        id: member._id,
                        name: member.name,
                        description: member.oneLiner || member.role || "Member",
                        mobile: member.phoneNumber || null, // Only if present
                        similarity: score
                    };
                })
                .filter(item => item.similarity >= THRESHOLD)
                .sort((a, b) => {
                    // Sort by Alphabetical Name as requested
                    return a.name.localeCompare(b.name);
                });

            console.log(`✅ Found ${results.length} matched members.`);

            res.status(200).json({
                message: "Search results",
                data: results
            });

        } catch (error) {
            console.error("Error searching members:", error);
            res.status(500).json({ error: "Internal Server Error" });
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

            // Invalidate Cache
            await cacheService.invalidateEventLists();

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
            }

            // Invalidate Cache
            await cacheService.invalidateEventLists();

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