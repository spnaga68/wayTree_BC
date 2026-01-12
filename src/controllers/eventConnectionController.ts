
import { Request, Response } from 'express';
import mongoose from 'mongoose';

import CommunityConnection from '../models/CommunityConnection';
import EventMember from '../models/EventMember';
import EventConnection from '../models/EventConnection';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import * as XLSX from 'xlsx';
import { AssistantPipeline } from '../pipelines/assistant_pipeline';

/**
 * Toggle event participation - join or leave an event
 * POST /event-connections/toggle-participation
 * Now uses unified MemberManagementService pipeline with embeddings
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

        const user = await User.findById(participantId);
        if (!user) {
            console.log('❌ User not found');
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Check if already joined (only check EventMember now - single source of truth)
        const existingMember = await EventMember.findOne({ eventId, userId: participantId });

        if (existingMember) {
            console.log('🚪 User is leaving event...');

            // Use MemberManagementService to remove (handles embedding deletion)
            const { MemberManagementService } = require('../services/memberManagementService');
            const result = await MemberManagementService.removeMemberFromEvent(eventId, participantId);

            if (result.success) {
                console.log('✅ User left event and embedding deleted');
                return res.status(200).json({
                    success: true,
                    message: 'Successfully left',
                    isJoined: false
                });
            } else {
                throw new Error(result.message);
            }
        } else {
            console.log('➕ User is joining event...');

            // Use MemberManagementService pipeline (handles user creation, embedding generation)
            const { MemberManagementService } = require('../services/memberManagementService');

            // Prepare member data from existing user
            const memberData = {
                name: user.name,
                founderName: user.name,
                company: user.company || '',
                organisation: user.company || '',
                bio: user.oneLiner || '',
                about: user.oneLiner || '',
                website: user.website || '',
                phoneNumber: user.phoneNumber,
                email: user.email,
            };

            // Add member using unified pipeline (creates embedding automatically)
            const result = await MemberManagementService.addMemberToEvent(
                eventId,
                event.createdBy.toString(),
                memberData,
                'join' // source
            );

            if (result.success) {
                console.log(`✅ User joined event. Embedding created: ${result.embeddingCreated}`);

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
                    message: event.isCommunity ? 'Successfully joined community' : 'Successfully joined event',
                    isJoined: true,
                    embeddingCreated: result.embeddingCreated,
                    isNewUser: result.isNewUser
                });
            } else {
                throw new Error(result.message);
            }
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

        // DEBUG: Show first participant's full data
        if (participants.length > 0) {
            console.log(`\n🔍 First Participant Data:`);
            console.log(`   Name: ${participants[0].name}`);
            console.log(`   Company: ${participants[0].company}`);
            console.log(`   OneLiner: ${participants[0].oneLiner ? participants[0].oneLiner.substring(0, 200) : 'EMPTY'}`);
        }

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
 * Now uses MemberPipeline for consistency
 */
export const addManualMember = async (req: Request, res: Response) => {
    try {
        const { eventId, name, phoneNumber, email, company, bio, description } = req.body;
        let { organizerId } = req.body;

        console.log(`\n➕ [ADD MANUAL MEMBER] Event: ${eventId}, Name: ${name}`);

        if (!eventId || !name) {
            return res.status(400).json({
                success: false,
                message: 'EventId and Name are required'
            });
        }

        // Fetch Event
        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        // Auto-fill organizer if not provided
        if (!organizerId) {
            organizerId = event.createdBy;
        }

        // Use MemberPipeline for consistent handling
        const { MemberPipeline } = require('../pipelines/member_pipeline');

        const result = await MemberPipeline.addMember({
            eventId,
            organizerId,
            userData: {
                name,
                company: company || '',
                bio: bio || description || '',
                phoneNumber: phoneNumber || undefined,  // Will auto-generate if missing
                email: email || undefined,              // Will auto-generate if missing
                website: undefined
            },
            source: 'manual'
        });

        if (result.success) {
            console.log(`✅ Manual member added via pipeline. Embedding: ${result.embeddingCreated}`);

            return res.status(201).json({
                success: true,
                message: 'Member added successfully',
                userId: result.userId,
                isNewUser: result.isNewUser,
                embeddingCreated: result.embeddingCreated
            });
        } else if (result.isExistingMember) {
            return res.status(409).json({
                success: false,
                message: 'User is already a member of this event'
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result.error || result.message
            });
        }

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

/**
 * Ask the Event Assistant
 * POST /event-connections/ask
 */
export const askAssistant = async (req: Request, res: Response) => {
    try {
        const { eventId, question, userId } = req.body;

        if (!eventId || !question) {
            return res.status(400).json({
                success: false,
                message: 'eventId and question are required'
            });
        }

        const result = await AssistantPipeline.askQuestion(eventId, question, userId);

        return res.status(200).json({
            success: true,
            answer: result.answer,
            sources: result.sources
        });

    } catch (error) {
        console.error('Error in askAssistant:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: (error as Error).message
        });
    }
};
