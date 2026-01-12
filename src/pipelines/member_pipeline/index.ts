import mongoose from 'mongoose';
import { User } from '../../models/User';
import EventMember from '../../models/EventMember';
import { Event } from '../../models/Event';
import { EmbeddingService } from '../../services/embeddingService';
import { SupabaseService } from '../../services/supabaseService';

/**
 * UNIFIED MEMBER PIPELINE
 * 
 * This is a standalone pipeline that handles ALL member operations:
 * - App joins (user clicks "Join" button)
 * - Manual additions (organizer adds via form)
 * - Excel uploads (bulk import)
 * - JSON uploads (bulk import)
 * 
 * Features:
 * - User existence checking
 * - Automatic user creation
 * - Embedding generation
 * - Supabase storage
 * - Duplicate prevention
 */

interface PipelineInput {
    eventId: string;
    organizerId: string;
    userData: {
        userId?: string;          // For existing users (app joins)
        name: string;
        company?: string;
        bio?: string;
        phoneNumber?: string;
        email?: string;
        website?: string;
        linkedin?: string;
    };
    source: 'join' | 'manual' | 'excel' | 'json';
}

interface PipelineOutput {
    success: boolean;
    userId: string;
    isNewUser: boolean;
    isExistingMember: boolean;
    embeddingCreated: boolean;
    message: string;
    error?: string;
}

export class MemberPipeline {
    /**
     * MAIN PIPELINE ENTRY POINT
     * All member additions go through this single method
     */
    static async addMember(input: PipelineInput): Promise<PipelineOutput> {
        console.log(`\n🔄 [MEMBER PIPELINE] Starting for ${input.userData.name} (source: ${input.source})`);

        try {
            // STEP 0: Strict Input Validation (User Policy)
            // "Manually add must have name, mobile, bio, company"
            if (input.source === 'manual') {
                const { name, phoneNumber, company, bio } = input.userData;
                const missingFields = [];
                if (!name) missingFields.push('Name');
                if (!phoneNumber) missingFields.push('Mobile Number');
                if (!company) missingFields.push('Company');
                if (!bio) missingFields.push('Bio/OneLiner');

                if (missingFields.length > 0) {
                    return this.errorResponse(`Missing required fields: ${missingFields.join(', ')}`);
                }
            }

            // STEP 1: Validate Event
            console.log(`\n📋 STEP 1: Validating Event...`);
            const event = await this.validateEvent(input.eventId);
            if (!event) {
                console.log(`❌ Event not found: ${input.eventId}`);
                return this.errorResponse('Event not found');
            }
            console.log(`✅ Event validated: ${event.title || event.name || 'Unnamed Event'}`);


            // STEP 2: Get or Create User
            const { user, isNewUser, isUpdated } = await this.getOrCreateUser(input.userData);
            const userId = user._id.toString();

            console.log(`✅ User: ${user.name} (${isNewUser ? 'NEW' : 'EXISTING'})${isUpdated ? ' [UPDATED]' : ''}`);

            // STEP 3: Check if Already Member
            console.log(`\n🔍 STEP 3: Checking if already member...`);
            const existingMember = await this.checkExistingMember(input.eventId, userId);
            if (existingMember) {
                console.log(`⚠️ User already a member of this event`);

                // If user was updated, regenerate embedding
                if (isUpdated) {
                    console.log(`🔄 User profile updated, refreshing embedding...`);
                    const embeddingCreated = await this.createAndStoreEmbedding(
                        input.eventId,
                        userId,
                        user
                    );

                    console.log(`${'='.repeat(80)}\n`);
                    return {
                        success: true,
                        userId,
                        isNewUser: false,
                        isExistingMember: true,
                        embeddingCreated,
                        message: 'Member profile updated successfully'
                    };
                }

                console.log(`${'='.repeat(80)}\n`);
                return {
                    success: true,
                    userId,
                    isNewUser: false,
                    isExistingMember: true,
                    embeddingCreated: false,
                    message: 'User already a member of this event'
                };
            }
            console.log(`✅ User is not a member yet`);

            // STEP 4: Add to EventMembers Collection
            console.log(`\n💾 STEP 4: Adding to EventMembers collection...`);
            await this.addToEventMembers(input.eventId, input.organizerId, userId, user, input.source);
            console.log(`✅ Added to EventMembers collection`);
            console.log(`   Event ID: ${input.eventId}`);
            console.log(`   User ID: ${userId}`);
            console.log(`   Phone: ${user.phoneNumber}`);
            console.log(`   Source: ${input.source}`);

            // STEP 5: Generate and Store Embedding
            console.log(`\n🧠 STEP 5: Creating embedding...`);
            const embeddingCreated = await this.createAndStoreEmbedding(
                input.eventId,
                userId,
                user
            );
            console.log(`${embeddingCreated ? '✅' : '⚠️'} Embedding ${embeddingCreated ? 'created and stored' : 'skipped'}`);

            // STEP 6: Return Success
            console.log(`\n🎉 PIPELINE COMPLETED SUCCESSFULLY`);
            console.log(`   User ID: ${userId}`);
            console.log(`   Is New User: ${isNewUser}`);
            console.log(`   Embedding Created: ${embeddingCreated}`);
            console.log(`${'='.repeat(80)}\n`);

            return {
                success: true,
                userId,
                isNewUser,
                isExistingMember: false,
                embeddingCreated,
                message: 'Member added successfully'
            };

        } catch (error) {
            console.log(`\n❌ [MEMBER PIPELINE] ERROR`);
            console.error(error);
            console.log(`${'='.repeat(80)}\n`);
            return this.errorResponse((error as Error).message);
        }
    }

    /**
     * REMOVE MEMBER FROM EVENT
     * Handles leaving/removal with embedding cleanup
     */
    static async removeMember(eventId: string, userId: string): Promise<PipelineOutput> {
        console.log(`\n🔄 [MEMBER PIPELINE] Removing ${userId} from ${eventId}`);

        try {
            // STEP 1: Remove from EventMembers
            const deleted = await EventMember.deleteOne({ eventId, userId });

            if (deleted.deletedCount === 0) {
                return this.errorResponse('Member not found in event');
            }

            console.log(`✅ Removed from EventMembers collection`);

            // STEP 2: Delete Embedding from Supabase
            try {
                await SupabaseService.deleteMemberEmbedding(eventId, userId);
                console.log(`✅ Embedding deleted from Supabase`);
            } catch (embErr) {
                console.warn('⚠️ Failed to delete embedding:', embErr);
                // Don't fail the entire operation
            }

            return {
                success: true,
                userId,
                isNewUser: false,
                isExistingMember: false,
                embeddingCreated: false,
                message: 'Member removed successfully'
            };

        } catch (error) {
            console.error('❌ [MEMBER PIPELINE] Remove error:', error);
            return this.errorResponse((error as Error).message);
        }
    }

    /**
     * UPDATE MEMBER PROFILE
     * Updates user data and regenerates embedding
     */
    static async updateMember(
        eventId: string,
        userId: string,
        updates: Partial<{ name: string; company: string; bio: string; website: string }>
    ): Promise<PipelineOutput> {
        console.log(`\n🔄 [MEMBER PIPELINE] Updating ${userId}`);

        try {
            // STEP 1: Update User in Database
            const user = await User.findByIdAndUpdate(
                userId,
                {
                    ...(updates.name && { name: updates.name }),
                    ...(updates.company && { company: updates.company }),
                    ...(updates.bio && { oneLiner: updates.bio }),
                    ...(updates.website && { website: updates.website }),
                },
                { new: true }
            );

            if (!user) {
                return this.errorResponse('User not found');
            }

            console.log(`✅ User updated in database`);

            // STEP 2: Delete Old Embedding
            try {
                await SupabaseService.deleteMemberEmbedding(eventId, userId);
                console.log(`✅ Old embedding deleted`);
            } catch (err) {
                console.warn('⚠️ Failed to delete old embedding:', err);
            }

            // STEP 3: Create New Embedding
            const embeddingCreated = await this.createAndStoreEmbedding(eventId, userId, user);
            console.log(`✅ New embedding ${embeddingCreated ? 'created' : 'skipped'}`);

            return {
                success: true,
                userId,
                isNewUser: false,
                isExistingMember: true,
                embeddingCreated,
                message: 'Member profile updated successfully'
            };

        } catch (error) {
            console.error('❌ [MEMBER PIPELINE] Update error:', error);
            return this.errorResponse((error as Error).message);
        }
    }

    // ==================== PRIVATE HELPER METHODS ====================

    /**
     * Validate that event exists
     */
    private static async validateEvent(eventId: string): Promise<any | null> {
        try {
            const event = await Event.findById(eventId);
            if (!event) return null;

            // User Requirement: "Adding member only allowed when the event is approved"
            if (event.isVerified !== true) {
                console.log(`❌ Event ${eventId} is not verified. Member addition blocked.`);
                return null; // treat as not valid/found for the purpose of adding members
            }

            return event;
        } catch (error) {
            console.error('❌ Event validation failed:', error);
            return null;
        }
    }

    /**
     * Get existing user or create new one
     */
    /**
     * Get existing user or create new one
     */
    private static async getOrCreateUser(userData: PipelineInput['userData']): Promise<{
        user: any;
        isNewUser: boolean;
        isUpdated: boolean;
    }> {
        let user = null;

        // 1. Check by UserID (App Join)
        if (userData.userId) {
            user = await User.findById(userData.userId);
        }

        // 2. Check by Phone
        if (!user && userData.phoneNumber) {
            user = await User.findOne({ phoneNumber: userData.phoneNumber });
            if (user) console.log(`✅ Found existing user by phone: ${userData.phoneNumber}`);
        }

        // 3. Check by Email
        if (!user && userData.email) {
            user = await User.findOne({ email: userData.email.toLowerCase() });
            if (user) console.log(`✅ Found existing user by email: ${userData.email}`);
        }

        // 4. Check by Name + Company
        if (!user && userData.name && userData.company) {
            user = await User.findOne({
                name: { $regex: new RegExp(`^${userData.name}$`, 'i') },
                company: { $regex: new RegExp(`^${userData.company}$`, 'i') },
            });
            if (user) console.log(`✅ Found existing user by name+company`);
        }

        // If found, check for updates
        if (user) {
            let isUpdated = false;

            // Check if Bio needs update (e.g. from Excel re-upload)
            if (userData.bio && userData.bio !== user.oneLiner) {
                console.log(`📝 Updating user bio...`);
                user.oneLiner = userData.bio;
                isUpdated = true;
            }

            // Check if Company needs update (e.g. was empty)
            if (userData.company && userData.company !== user.company) {
                user.company = userData.company;
                isUpdated = true;
            }

            if (isUpdated) {
                await user.save();
                console.log(`💾 Saved updated user data`);
            }

            return { user, isNewUser: false, isUpdated };
        }

        // Create new user
        console.log(`📝 Creating new user: ${userData.name}`);
        console.log(`   Phone provided: ${userData.phoneNumber || 'NO - will generate'}`);
        console.log(`   Email provided: ${userData.email || 'NO - will generate'}`);

        const phoneNumber = userData.phoneNumber || await this.generateUniquePhone();
        const email = userData.email || `user${phoneNumber}@waytree.temp`;

        console.log(`   Final phone: ${phoneNumber}`);
        console.log(`   Final email: ${email}`);

        const newUser = await User.create({
            name: userData.name,
            email: email.toLowerCase(),
            company: userData.company || undefined,
            oneLiner: userData.bio || undefined,
            website: userData.website || undefined,
            phoneNumber: phoneNumber,
            role: 'member',
        });

        console.log(`✅ New user created successfully`);
        console.log(`   User ID: ${newUser._id}`);
        console.log(`   Phone stored: ${newUser.phoneNumber}`);
        console.log(`   Email stored: ${newUser.email}`);

        return { user: newUser, isNewUser: true, isUpdated: false };
    }

    /**
     * Generate unique phone number
     */
    private static async generateUniquePhone(): Promise<string> {
        let attempts = 0;
        while (attempts < 100) {
            const firstDigit = [9, 8, 7][Math.floor(Math.random() * 3)];
            const remaining = Math.floor(Math.random() * 900000000) + 100000000;
            const phoneNumber = `${firstDigit}${remaining}`;

            const existing = await User.findOne({ phoneNumber });
            if (!existing) {
                console.log(`📱 Generated unique phone: ${phoneNumber}`);
                return phoneNumber;
            }
            attempts++;
        }
        throw new Error('Failed to generate unique phone number');
    }

    /**
     * Check if user is already a member
     */
    private static async checkExistingMember(eventId: string, userId: string): Promise<boolean> {
        const existing = await EventMember.findOne({ eventId, userId });
        return !!existing;
    }

    /**
     * Add user to EventMembers collection
     */
    private static async addToEventMembers(
        eventId: string,
        organizerId: string,
        userId: string,
        user: any,
        source: string
    ): Promise<void> {
        await EventMember.create({
            eventId,
            organizerId,
            userId,
            name: user.name,
            phoneNumber: user.phoneNumber,
            source,
            joinedAt: new Date(),
        });
    }

    /**
     * Create profile embedding and store in Supabase
     */
    private static async createAndStoreEmbedding(
        eventId: string,
        userId: string,
        user: any
    ): Promise<boolean> {
        try {
            // Create profile text (mobile excluded from embedding)
            const profileText = this.createProfileText(user);

            if (!profileText.trim()) {
                console.warn('⚠️ Empty profile text, skipping embedding');
                return false;
            }

            // Generate embedding
            const embedding = await EmbeddingService.generateEmbedding(profileText);

            if (!embedding || embedding.length === 0) {
                console.warn('⚠️ No embedding generated');
                return false;
            }

            // Store in Supabase
            await SupabaseService.storeMemberProfile(
                eventId,
                userId,
                profileText,
                embedding,
                {
                    user_id: userId,
                    name: user.name,
                    company: user.company || '',
                    bio: user.oneLiner || '',
                    phoneNumber: user.phoneNumber, // Stored in metadata, not embedding
                }
            );

            return true;

        } catch (error) {
            console.error('❌ Embedding creation failed:', error);
            return false;
        }
    }

    /**
     * Helper to clean text for embedding
     */
    private static cleanTextForEmbedding(text: string): string {
        if (!text) return '';
        return text
            .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Create profile text for embedding
     * Mobile number is NOT included in embedding text
     */
    private static createProfileText(user: any): string {
        const parts = [
            `Name: ${user.name}`,
            user.company ? `Company: ${user.company}` : null,
            user.oneLiner ? `Description: ${user.oneLiner}` : null,
        ].filter(Boolean);

        const rawText = parts.join(' . ');
        return this.cleanTextForEmbedding(rawText);
    }

    /**
     * Create error response
     */
    private static errorResponse(message: string): PipelineOutput {
        return {
            success: false,
            userId: '',
            isNewUser: false,
            isExistingMember: false,
            embeddingCreated: false,
            message: 'Operation failed',
            error: message
        };
    }
}
