
import { Request, Response } from 'express';
import mongoose from 'mongoose';

import CommunityConnection from '../models/CommunityConnection';
import EventMember from '../models/EventMember';
import { Event } from '../models/Event';
import { User } from '../models/User';
import { Notification } from '../models/Notification';
import * as XLSX from 'xlsx';



/**
 * Toggle event participation - join or leave an event
 * POST /event-connections/toggle
 */
export const toggleEventParticipation = async (req: Request, res: Response) => {
    try {
        console.log('📥 Toggle Event Participation Request Received');
        console.log('   - Body:', JSON.stringify(req.body));

        const { eventId, participantId } = req.body;

        // Validate inputs
        if (!eventId || !participantId) {
            console.log('❌ Validation failed: Missing eventId or participantId');
            return res.status(400).json({
                success: false,
                message: 'Event ID and Participant ID are required'
            });
        }

        // Check if event exists to determine type
        const event = await Event.findById(eventId);
        if (!event) {
            console.log('❌ Event not found:', eventId);
            return res.status(404).json({
                success: false,
                message: 'Event not found'
            });
        }

        const isCommunity = event.isCommunity || false;

        if (isCommunity) {
            // COMMUNITY FLOW: Use CommunityConnection
            const ConnectionModel = CommunityConnection;
            const existingConnection = await ConnectionModel.findOne({ eventId, participantId });

            if (existingConnection) {
                // Leave Community
                await ConnectionModel.deleteOne({ _id: existingConnection._id });
                console.log('✅ User left the community');
                return res.status(200).json({
                    success: true,
                    message: 'Successfully left the community',
                    isJoined: false
                });
            } else {
                // Join Community
                const newConnection = new ConnectionModel({
                    eventId,
                    organizerId: event.createdBy,
                    participantId,
                });
                await newConnection.save();
                console.log('✅ User joined the community');

                // Create Notification
                try {
                    if (event.createdBy.toString() !== participantId) {
                        await Notification.create({
                            recipientId: event.createdBy,
                            actorId: participantId,
                            eventId: event._id,
                            type: 'EVENT_JOIN'
                        });
                        console.log('🔔 Notification created for community join');
                    }
                } catch (notifyErr) {
                    console.error('Failed to create notification:', notifyErr);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Successfully joined the community',
                    isJoined: true,
                    connection: newConnection
                });
            }

        } else {
            // EVENT FLOW: Use ONLY EventMember (No EventConnection)
            const existingMember = await EventMember.findOne({ eventId, userId: participantId });

            if (existingMember) {
                // Leave Event
                await EventMember.deleteOne({ _id: existingMember._id });
                console.log('✅ User left the event (removed from member roster)');
                return res.status(200).json({
                    success: true,
                    message: 'Successfully left the event',
                    isJoined: false
                });
            } else {
                // Join Event
                const user = await User.findById(participantId);
                if (!user) {
                    return res.status(404).json({ success: false, message: 'User not found' });
                }

                await EventMember.create({
                    eventId,
                    organizerId: event.createdBy,
                    userId: participantId,
                    name: user.name || 'Unknown',
                    phoneNumber: user.phoneNumber,
                    source: 'join'
                });

                console.log('✅ User joined the event (added to member roster)');
                // Update attendees in Event for metadata
                (event.attendees as any).addToSet(participantId);
                await event.save();

                // Create Notification
                try {
                    if (event.createdBy.toString() !== participantId) {
                        await Notification.create({
                            recipientId: event.createdBy,
                            actorId: participantId,
                            eventId: event._id,
                            type: 'EVENT_JOIN'
                        });
                        console.log('🔔 Notification created for event join');
                    }
                } catch (notifyErr) {
                    console.error('Failed to create notification:', notifyErr);
                }

                return res.status(200).json({
                    success: true,
                    message: 'Successfully joined the event',
                    isJoined: true
                });
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

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const isCommunity = event.isCommunity || false;
        let isJoined = false;
        let connection = null;

        if (isCommunity) {
            const found = await CommunityConnection.findOne({ eventId, participantId });
            isJoined = !!found;
            connection = found;
        } else {
            const found = await EventMember.findOne({ eventId, userId: participantId });
            isJoined = !!found;
            connection = found;
        }

        return res.status(200).json({
            success: true,
            isJoined,
            connection
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

        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ success: false, message: 'Invalid event ID' });
        }

        const event = await Event.findById(eventId);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }

        const isCommunity = event.isCommunity || false;

        // 1. Fetch from EventMember (Covers Manual, Excel, and Event-Joins)
        const eventMembersPromise = EventMember.find({ eventId }).sort({ joinedAt: -1 });

        // 2. If Community, also fetch CommunityConnection (Covers Community-Joins)
        let communityConnectionsPromise: any = Promise.resolve([]);
        if (isCommunity) {
            communityConnectionsPromise = CommunityConnection.find({ eventId })
                .populate('participantId', 'name email phoneNumber photoUrl role company position')
                .sort({ joinedAt: -1 });
        }

        const [eventMembers, communityConnections] = await Promise.all([
            eventMembersPromise,
            communityConnectionsPromise
        ]);

        // 3. Normalize and Deduplicate
        const combinedMembers = new Map<string, any>();

        // Helper to generate key (Phone preferred, else Name)
        const getKey = (p: any, isConn: boolean = false) => {
            let phone, name;
            if (isConn) {
                phone = p.participantId?.phoneNumber;
                name = p.participantId?.name;
            } else {
                phone = p.phoneNumber;
                name = p.name;
            }

            if (phone) return `phone:${String(phone).replace(/\D/g, '')}`;
            if (name) return `name:${String(name).toLowerCase().trim()}`;
            return `id:${p._id}`;
        };

        // Add Community Connections (App Users who joined community)
        // These take precedence as they are "Active Users"
        (communityConnections as any[]).forEach((conn: any) => {
            if (conn.participantId) {
                const key = getKey(conn, true);
                combinedMembers.set(key, {
                    _id: conn._id,
                    eventId: conn.eventId,
                    organizerId: conn.organizerId,
                    userId: conn.participantId._id,
                    name: conn.participantId.name,
                    phoneNumber: conn.participantId.phoneNumber,
                    source: 'join',
                    joinedAt: conn.joinedAt,
                    participant: conn.participantId // Keep full profile
                });
            }
        });

        // Add EventMembers (Manual, Excel, or Event-type Joins)
        (eventMembers as any[]).forEach((member: any) => {
            const key = getKey(member, false);
            // Use the manual/excel entry if not already present from community connection
            if (!combinedMembers.has(key)) {
                combinedMembers.set(key, member.toObject());
            }
        });

        // Convert Map to Array and Sort by Name
        const participants = Array.from(combinedMembers.values()).sort((a, b) => {
            const nameA = (a.name || 'Unknown').toLowerCase();
            const nameB = (b.name || 'Unknown').toLowerCase();
            return nameA.localeCompare(nameB);
        });

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

        const results = [];
        for (const row of data) {
            // Flexible column matching
            const name = row['Name'] || row['name'] || row['NAME'];
            const phone = row['Mobile'] || row['Phone'] || row['Number'] || row['mobile'] || row['phone'];

            if (name) {
                try {
                    const newMember = await EventMember.create({
                        eventId,
                        organizerId,
                        name,
                        phoneNumber: phone ? String(phone) : undefined,
                        source: 'excel'
                    });
                    results.push(newMember);
                } catch (err) {
                    console.warn('Skipping duplicate or invalid member:', name);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: `Processed ${results.length} members`,
            count: results.length
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
