
import { Request, Response } from 'express';
import mongoose from 'mongoose';

import CommunityConnection from '../models/CommunityConnection';
import EventMember from '../models/EventMember';
import EventConnection from '../models/EventConnection';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import * as XLSX from 'xlsx';

/**
 * Toggle event participation - join or leave an event
 * POST /event-connections/toggle-participation
 */
export const toggleEventParticipation = async (req: Request, res: Response) => {
    try {
        const { eventId, participantId } = req.body;
        console.log(`\n🔘 [TOGGLE PARTICIPATION] Event: ${eventId}, User: ${participantId}`);

        if (!eventId || !participantId) {
            return res.status(400).json({
                success: false,
                message: 'Event ID and Participant ID are required'
            });
        }

        const event = await Event.findById(eventId);
        if (!event) {
            console.log('❌ Event not found');
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Check if already joined (Check ALL models for robustness)
        const [existingMember, existingConn, existingComm] = await Promise.all([
            EventMember.findOne({ eventId, userId: participantId }),
            EventConnection.findOne({ eventId, participantId }),
            CommunityConnection.findOne({ eventId, participantId })
        ]);

        const joinedRecord = existingMember || existingConn || existingComm;

        if (joinedRecord) {
            console.log('🚪 User is leaving event...');
            // Leave: Remove from all possible models
            await Promise.all([
                EventMember.deleteOne({ eventId, userId: participantId }),
                EventConnection.deleteOne({ eventId, participantId }),
                CommunityConnection.deleteOne({ eventId, participantId }),
                Event.findByIdAndUpdate(eventId, { $pull: { attendees: participantId } })
            ]);

            return res.status(200).json({
                success: true,
                message: 'Successfully left',
                isJoined: false
            });
        } else {
            console.log('➕ User is joining (Event/Community)...');
            const user = await User.findById(participantId);
            if (!user) {
                console.log('❌ User not found');
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            let memberRecord;
            let successMessage = 'Successfully joined';

            if (event.isCommunity) {
                // JOIN COMMUNITY -> CommunityConnection
                memberRecord = await CommunityConnection.create({
                    eventId,
                    organizerId: event.createdBy,
                    participantId, // using participantId as per schema
                    name: user.name || 'Unknown',
                    phoneNumber: user.phoneNumber,
                    source: 'join',
                    isJoined: true,
                    isCommunity: true
                });
                successMessage = 'Successfully joined community';
                console.log(`✅ User joined Community. ID: ${memberRecord._id}`);
            } else {
                // JOIN EVENT -> EventMember
                memberRecord = await EventMember.create({
                    eventId,
                    organizerId: event.createdBy,
                    userId: participantId, // using userId as per schema
                    name: user.name || 'Unknown',
                    phoneNumber: user.phoneNumber,
                    source: 'join',
                    isJoined: true,
                    isEvent: true
                });
                successMessage = 'Successfully joined event';
                console.log(`✅ User joined Event. ID: ${memberRecord._id}`);
            }

            // Also add to attendees array for metadata consistency
            await Event.findByIdAndUpdate(eventId, { $addToSet: { attendees: participantId } });

            // Create Notification
            try {
                if (event.createdBy.toString() !== participantId) {
                    await Notification.create({
                        recipientId: event.createdBy,
                        actorId: participantId,
                        eventId: event._id,
                        type: 'EVENT_JOIN'
                    });
                }
            } catch (notifyErr) {
                console.error('Failed to create notification:', notifyErr);
            }

            return res.status(200).json({
                success: true,
                message: successMessage,
                isJoined: true,
                member: memberRecord
            });
        }

    } catch (error) {
        console.error('❌ Error toggling participation:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: (error as any).message
        });
    }
};

/**
 * Check if user has joined an event
 * GET /event-connections/check/:eventId/:participantId
 */
export const checkEventParticipation = async (req: Request, res: Response) => {
    try {
        const { eventId, participantId } = req.params;

        const [existingMember, existingConn, existingComm, event] = await Promise.all([
            EventMember.findOne({ eventId, userId: participantId }),
            EventConnection.findOne({ eventId, participantId }),
            CommunityConnection.findOne({ eventId, participantId }),
            Event.findById(eventId)
        ]);

        const isAtendeeInArray = event?.attendees?.some(id => id.toString() === participantId) || false;
        const isJoined = !!(existingMember || existingConn || existingComm || isAtendeeInArray);

        return res.status(200).json({
            success: true,
            isJoined,
            connection: existingMember || existingConn || existingComm
        });
    } catch (error) {
        console.error('❌ Error checking participation:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error',
            error: (error as any).message
        });
    }
};

/**
 * Get all participants for an event
 * GET /event-connections/participants/:eventId
 */
export const getEventParticipants = async (req: Request, res: Response) => {
    try {
        const { eventId } = req.params;
        console.log(`\n🔍 [FETCH PARTICIPANTS] Event ID: ${eventId}`);

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            console.log('❌ Invalid Event ID format');
            return res.status(400).json({ success: false, message: 'Invalid event ID' });
        }

        const objEventId = new mongoose.Types.ObjectId(eventId);

        // Fetch from all possible sources with logs
        console.log('--- DB QUERIES START ---');
        const [eventMembers, eventConns, communityConns, eventDoc] = await Promise.all([
            EventMember.find({ eventId: objEventId }).populate('userId', 'name email phoneNumber photoUrl role company oneLiner').lean(),
            EventConnection.find({ eventId: objEventId }).populate('participantId', 'name email phoneNumber photoUrl role company oneLiner').lean(),
            CommunityConnection.find({ eventId: objEventId }).populate('participantId', 'name email phoneNumber photoUrl role company oneLiner').lean(),
            Event.findById(objEventId).populate('attendees', 'name email phoneNumber photoUrl role company oneLiner').lean()
        ]);

        console.log(`📊 DB Results for ${eventId}:`);
        console.log(`   - EventMember records: ${eventMembers.length}`);
        console.log(`   - EventConnection records: ${eventConns.length}`);
        console.log(`   - CommunityConnection records: ${communityConns.length}`);
        console.log(`   - Event Doc found: ${!!eventDoc}`);
        if (eventDoc) {
            console.log(`   - Event Attendees Array size: ${eventDoc.attendees?.length || 0}`);
        }

        // FALLBACK: If nothing found with ObjectId, try String ID (just in case)
        let fallbackMembers: any[] = [];
        if (eventMembers.length === 0 && eventConns.length === 0 && communityConns.length === 0 && (!eventDoc || (eventDoc.attendees?.length || 0) === 0)) {
            console.log('🕵️ ObjectId queries empty, trying String ID fallback...');
            fallbackMembers = await EventMember.find({ eventId: eventId }).lean();
            console.log(`   - EventMember (String ID search): ${fallbackMembers.length}`);
        }

        const combinedMembers = new Map<string, any>();

        // Helper to normalize and add to map
        const addMember = (m: any, source: string) => {
            if (!m) return;

            // Handle both flat (EventMember) and nested (EventConnection/attendees) structures
            const userData = m.participantId || m.userId || (m.email || m.phoneNumber || m.name ? m : null);
            const userId = userData?._id?.toString() || m.userId?.toString() || m.participantId?.toString() || (typeof m === 'string' ? m : m._id?.toString());
            const name = userData?.name || m.name || 'Unknown';
            const phone = userData?.phoneNumber || m.phoneNumber || '';
            const email = userData?.email || m.email || '';

            const key = phone ? `phone:${phone}` : (email ? `email:${email}` : `id:${userId}`);

            if (key && !combinedMembers.has(key)) {
                combinedMembers.set(key, {
                    _id: m._id || userId,
                    name: name,
                    phoneNumber: phone,
                    email: email,
                    photoUrl: userData?.photoUrl || m.photoUrl || '',
                    role: userData?.role || m.role || '',
                    company: userData?.company || m.company || '',
                    oneLiner: userData?.oneLiner || m.oneLiner || '',
                    source: m.source || source,
                    joinedAt: m.joinedAt || m.createdAt || eventDoc?.createdAt,
                    userId: userId
                });
            }
        };

        // 1. Process EventMember (Manual/Excel/Joins)
        eventMembers.forEach(m => addMember(m, 'manual'));
        fallbackMembers.forEach(m => addMember(m, 'manual'));

        // 2. Process EventConnection
        eventConns.forEach(m => addMember(m, 'join'));

        // 3. Process CommunityConnection
        communityConns.forEach(m => addMember(m, 'join'));

        // 4. Process attendees array
        if (eventDoc?.attendees) {
            eventDoc.attendees.forEach((u: any) => addMember(u, 'join'));
        }

        const participants = Array.from(combinedMembers.values()).sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
        );

        console.log(`✅ FINAL TOTAL participants for event ${eventId}: ${participants.length}`);

        return res.status(200).json({
            success: true,
            count: participants.length,
            participants: participants
        });

    } catch (error) {
        console.error('❌ Error fetching participants:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch participants',
            error: (error as any).message
        });
    }
};


/**
 * Manually add a member to an event/community
 * POST /event-connections/add-member
 */
export const addManualMember = async (req: Request, res: Response) => {
    try {
        const { eventId, name, phoneNumber, description } = req.body;
        let { organizerId } = req.body;

        if (!eventId || !name || !phoneNumber) {
            return res.status(400).json({
                success: false,
                message: 'EventId, Name, and PhoneNumber are required'
            });
        }

        // 1. Fetch Event to check type (Event vs Community) AND organizer
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Auto-fill organizer if not provided
        if (!organizerId) {
            organizerId = event.createdBy;
        }

        // 2. Check/Create User based on Phone Number
        let userId: any = null;
        let user = await User.findOne({ phoneNumber });

        if (user) {
            // User exists
            userId = user._id;
            console.log(`✅ User found for manual add: ${user.name} (${userId})`);
        } else {
            // Create New User
            console.log(`🆕 Creating new user for manual add: ${name} (${phoneNumber})`);

            // Create minimal user
            user = new User({
                name,
                phoneNumber,
                oneLiner: description || '',
                role: 'member', // Default role
                // email is required by schema! We need a dummy email for manual users?
                email: `manual_${phoneNumber}_${Date.now()}@placeholder.waytree.com`
            });

            // Generate Profile Embeddings immediately
            try {
                // Import Service dynamically or at top.
                const { EmbeddingService } = require('../services/embeddingService');

                const profileText = EmbeddingService.createUserProfileText(user);
                const embedding = await EmbeddingService.generateEmbedding(profileText);

                if (embedding && embedding.length > 0) {
                    user.profileEmbedding = embedding;
                    console.log('✨ Generated embeddings for new manual user');
                }
            } catch (embedError) {
                console.error('⚠️ Failed to generate embedding for new manual user:', embedError);
            }

            await user.save();
            userId = user._id;
        }

        // 3. Create Connection based on Type (Community vs Event)
        let memberRecord;

        if (event.isCommunity) {
            // Check for duplicate in CommunityConnection
            const existing = await CommunityConnection.findOne({ eventId, participantId: userId });
            if (existing) {
                // Update if exists but not joined? Or just return error? 
                // If manual add, assuming we force join if they were left?
                // For now, return conflict as before
                return res.status(409).json({
                    success: false,
                    message: `User is already a member of this community.`
                });
            }

            memberRecord = await CommunityConnection.create({
                eventId,
                organizerId: event.createdBy, // Community owner
                participantId: userId,
                name,
                phoneNumber,
                source: 'manual',
                isJoined: true, // Auto-join logic
                isCommunity: true
            });

        } else {
            // Event Member
            // Check for duplicate in EventMember
            // We check by userId OR phoneNumber to be safe
            const existing = await EventMember.findOne({
                eventId,
                $or: [{ userId }, { phoneNumber }]
            });

            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: `User is already a member of this event.`
                });
            }

            memberRecord = await EventMember.create({
                eventId,
                organizerId: event.createdBy,
                userId: userId,
                name,
                phoneNumber,
                source: 'manual',
                isJoined: true, // Auto-join logic
                isEvent: true
            });

            // Update Event attendees count/list if needed?
            // Event schema has 'attendees' array of strings.
            if (!event.attendees.includes(userId.toString())) {
                event.attendees.push(userId.toString());
                await event.save();
            }
        }

        // 4. Notification Logic (If added by someone else)
        try {
            // If the organizer added them, notify the USER (if they ever login/have app)
            // Or if a different organizer added them? 
            // Current logic: notifies ORGANIZER? 
            // "if organizerId !== registeredUser._id" -> If the person added is NOT the organizer?
            // Usually, Organizer adds Member. Notification should go to Member "You were added..."? 
            // Or if Member Manual Joined? "manual" source usually means Organizer typed it in.
            // Let's keep existing logic structure but fixing IDs.

            // If the actor is the Organizer, and they added 'user', we might want to notify 'user'.
            // But existing logic notified 'organizerId'. 
            // Let's skip notification changes for now to avoid breaking existing flow, unless required.
        } catch (notifyErr) {
            console.error('Failed to create notification for manual member:', notifyErr);
        }

        return res.status(201).json({
            success: true,
            message: 'Member added successfully',
            member: memberRecord
        });

    } catch (error) {
        console.error('❌ Error adding manual member:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add member',
            error: (error as any).message
        });
    }
};

/**
 * Upload members from Excel
 * POST /event-connections/upload-members
 */
export const uploadMembersExcel = async (req: Request, res: Response) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        let { eventId, organizerId } = req.body;

        // Fallback to query params if not in body
        if (!eventId) eventId = req.query.eventId;
        if (!organizerId) organizerId = req.query.organizerId;

        if (!eventId) {
            return res.status(400).json({ success: false, message: 'EventId is required' });
        }

        // Auto-fetch organizerId if missing
        if (!organizerId) {
            const event = await Event.findById(eventId);
            if (event) {
                organizerId = event.createdBy;
            } else {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
        }

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet) as any[];

        const added = [];
        const duplicates = [];

        for (const row of data) {
            // Flexible column matching
            const name = row['Name'] || row['name'] || row['NAME'];
            const phoneField = row['Mobile'] || row['Phone'] || row['Number'] || row['mobile'] || row['phone'];
            const phone = phoneField ? String(phoneField).trim() : undefined;

            if (name) {
                try {
                    // Check for duplicate in this event
                    if (phone) {
                        const existing = await EventMember.findOne({ eventId, phoneNumber: phone });
                        if (existing) {
                            duplicates.push({ name, phoneNumber: phone });
                            continue;
                        }
                    }

                    const newMember = await EventMember.create({
                        eventId,
                        organizerId,
                        name,
                        phoneNumber: phone,
                        source: 'excel'
                    });
                    added.push(newMember);
                } catch (err) {
                    console.warn('Error adding member from excel:', name, err);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${data.length} records.`,
            count: added.length,
            addedCount: added.length,
            duplicateCount: duplicates.length,
            duplicates: duplicates // Show which numbers were rejected
        });

    } catch (error) {
        console.error('❌ Error processing excel:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to process file',
            error: (error as any).message
        });
    }
};
