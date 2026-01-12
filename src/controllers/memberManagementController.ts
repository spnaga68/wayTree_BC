import { Request, Response } from 'express';
import { MemberManagementService } from '../services/memberManagementService';
import { Event } from '../models/Event';

/**
 * Add members from JSON array
 * POST /event-connections/add-members-json
 * Body: { eventId, organizerId?, members: [...] }
 */
export const addMembersFromJSON = async (req: Request, res: Response) => {
    try {
        let { eventId, organizerId, members } = req.body;

        // Validate inputs
        if (!eventId) {
            return res.status(400).json({
                success: false,
                message: 'eventId is required',
            });
        }

        if (!members || !Array.isArray(members) || members.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'members array is required and must not be empty',
            });
        }

        // Auto-fetch organizerId if missing
        if (!organizerId) {
            const event = await Event.findById(eventId);
            if (event) {
                organizerId = event.createdBy;
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found',
                });
            }
        }

        console.log(`📋 Processing ${members.length} members for event ${eventId}`);

        // Process all members
        const result = await MemberManagementService.addMembersFromJSON(
            eventId,
            organizerId,
            members,
            'manual'
        );

        return res.status(200).json({
            success: true,
            message: `Processed ${result.totalProcessed} members`,
            totalProcessed: result.totalProcessed,
            added: result.added,
            skipped: result.skipped,
            failed: result.failed,
            details: result.results.map((r) => ({
                userId: r.userId,
                isNewUser: r.isNewUser,
                embeddingCreated: r.embeddingCreated,
                message: r.message,
            })),
        });
    } catch (error) {
        console.error('❌ Error adding members from JSON:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add members',
            error: (error as Error).message,
        });
    }
};

/**
 * Add a single member manually
 * POST /event-connections/add-member
 * Body: { eventId, organizerId?, memberData: {...} }
 */
export const addSingleMember = async (req: Request, res: Response) => {
    try {
        let { eventId, organizerId, memberData } = req.body;

        if (!eventId || !memberData) {
            return res.status(400).json({
                success: false,
                message: 'eventId and memberData are required',
            });
        }

        // Auto-fetch organizerId if missing
        if (!organizerId) {
            const event = await Event.findById(eventId);
            if (event) {
                organizerId = event.createdBy;
            } else {
                return res.status(404).json({
                    success: false,
                    message: 'Event not found',
                });
            }
        }

        const result = await MemberManagementService.addMemberToEvent(
            eventId,
            organizerId,
            memberData,
            'manual'
        );

        if (result.success) {
            return res.status(200).json({
                success: true,
                userId: result.userId,
                isNewUser: result.isNewUser,
                embeddingCreated: result.embeddingCreated,
                message: result.message,
            });
        } else {
            return res.status(400).json({
                success: false,
                message: result.message,
            });
        }
    } catch (error) {
        console.error('❌ Error adding single member:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to add member',
            error: (error as Error).message,
        });
    }
};

/**
 * Update member profile
 * PUT /event-connections/update-member
 * Body: { eventId, userId, updates: {...} }
 */
export const updateMemberProfile = async (req: Request, res: Response) => {
    try {
        const { eventId, userId, updates } = req.body;

        if (!eventId || !userId || !updates) {
            return res.status(400).json({
                success: false,
                message: 'eventId, userId, and updates are required',
            });
        }

        const result = await MemberManagementService.updateMemberProfile(
            eventId,
            userId,
            updates
        );

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }
    } catch (error) {
        console.error('❌ Error updating member profile:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update member',
            error: (error as Error).message,
        });
    }
};

/**
 * Remove member from event
 * DELETE /event-connections/remove-member
 * Body: { eventId, userId }
 */
export const removeMemberFromEvent = async (req: Request, res: Response) => {
    try {
        const { eventId, userId } = req.body;

        if (!eventId || !userId) {
            return res.status(400).json({
                success: false,
                message: 'eventId and userId are required',
            });
        }

        const result = await MemberManagementService.removeMemberFromEvent(eventId, userId);

        if (result.success) {
            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }
    } catch (error) {
        console.error('❌ Error removing member:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to remove member',
            error: (error as Error).message,
        });
    }
};
