
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
            console.log('➕ User is joining event...');
            // Join: Use EventMember for full-profile support (Manual/Excel/App)
            const user = await User.findById(participantId);
            if (!user) {
                console.log('❌ User not found');
                return res.status(404).json({ success: false, message: 'User not found' });
            }

            const newMember = await EventMember.create({
                eventId,
                organizerId: event.createdBy,
                userId: participantId,
                name: user.name || 'Unknown',
                phoneNumber: user.phoneNumber,
                source: 'join'
            });

            // Also add to attendees array for metadata consistency
            await Event.findByIdAndUpdate(eventId, { $addToSet: { attendees: participantId } });
            console.log(`✅ User joined. EventMember created ID: ${newMember._id}`);

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
                message: 'Successfully joined',
                isJoined: true,
                member: newMember
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
            EventMember.find({ eventId: objEventId }).lean(),
            EventConnection.find({ eventId: objEventId }).populate('participantId', 'name email phoneNumber photoUrl role company').lean(),
            CommunityConnection.find({ eventId: objEventId }).populate('participantId', 'name email phoneNumber photoUrl role company').lean(),
            Event.findById(objEventId).populate('attendees', 'name email phoneNumber photoUrl role company').lean()
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
        const { eventId, name, phoneNumber } = req.body;
        let { organizerId } = req.body;

        if (!eventId || !name) {
            return res.status(400).json({
                success: false,
                message: 'EventId and Name are required'
            });
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

        // Check for duplicate in this event
        if (phoneNumber) {
            const existing = await EventMember.findOne({ eventId, phoneNumber });
            if (existing) {
                return res.status(409).json({
                    success: false,
                    message: `A member with phone number ${phoneNumber} is already added to this event.`
                });
            }
        }

        const newMember = new EventMember({
            eventId,
            organizerId,
            name,
            phoneNumber,
            source: 'manual'
        });

        await newMember.save();

        // Create Notification (if manual member is a registered user)
        try {
            const registeredUser = await User.findOne({
                $or: [
                    { phoneNumber: phoneNumber },
                    { name: name }
                ]
            });

            if (organizerId.toString() !== (registeredUser?._id.toString() || '')) {
                await Notification.create({
                    recipientId: organizerId,
                    actorId: registeredUser?._id,
                    externalActorName: registeredUser ? undefined : name,
                    eventId: eventId,
                    type: 'EVENT_JOIN'
                });
                console.log('🔔 Notification created for manual member addition');
            }
        } catch (notifyErr) {
            console.error('Failed to create notification for manual member:', notifyErr);
        }

        return res.status(201).json({
            success: true,
            message: 'Member added successfully',
            member: newMember
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
