import mongoose from 'mongoose';
import { User } from '../models/User';
import EventMember from '../models/EventMember';
import { EmbeddingService } from './embeddingService';
import { SupabaseService } from './supabaseService';

/**
 * Service for adding members to events/communities with:
 * - Flexible JSON input parsing
 * - User existence checking
 * - Automatic user creation
 * - Embedding generation and storage
 */

interface MemberInput {
    // Flexible input fields
    name?: string;
    founderName?: string;
    company?: string;
    organisation?: string;
    bio?: string;
    description?: string;
    founderDesignation?: string;
    about?: string;
    website?: string;
    linkedin?: string;
    phoneNumber?: string;
    phone?: string;
    mobile?: string;
    email?: string;
}

interface ExtractedMember {
    name: string;
    company: string;
    bio: string;
    website?: string;
    linkedin?: string;
    phoneNumber?: string;
    email?: string;
}

interface AddMemberResult {
    success: boolean;
    userId: string;
    isNewUser: boolean;
    embeddingCreated: boolean;
    message?: string;
}

export class MemberManagementService {
    /**
     * Extract and normalize member data from flexible JSON input
     */
    private static extractMemberData(input: MemberInput): ExtractedMember | null {
        // Extract name (priority: founderName > name)
        const name = (input.founderName || input.name || '').trim();
        if (!name) {
            console.warn('⚠️ Member skipped: No name found');
            return null;
        }

        // Extract company (priority: organisation > company)
        const company = (input.organisation || input.company || '').trim();

        // Extract bio/description
        // Priority: bio (if pre-processed) > description > about > founderDesignation
        const bio = (
            input.bio ||
            input.description ||
            input.about ||
            input.founderDesignation ||
            ''
        ).trim();

        // Extract contact info
        const website = input.website?.trim();
        const linkedin = input.linkedin?.trim();
        const phoneNumber = (input.phoneNumber || input.phone || input.mobile || '').trim();
        const email = input.email?.trim();

        return {
            name,
            company,
            bio,
            website,
            linkedin,
            phoneNumber: phoneNumber || undefined,
            email: email || undefined,
        };
    }

    /**
     * Generate a unique random phone number
     */
    private static async generateUniquePhoneNumber(): Promise<string> {
        let attempts = 0;
        const maxAttempts = 100;

        while (attempts < maxAttempts) {
            // Generate 10-digit phone number starting with 9, 8, or 7
            const firstDigit = [9, 8, 7][Math.floor(Math.random() * 3)];
            const remainingDigits = Math.floor(Math.random() * 900000000) + 100000000;
            const phoneNumber = `${firstDigit}${remainingDigits}`;

            // Check if it exists
            const existing = await User.findOne({ phoneNumber });
            if (!existing) {
                return phoneNumber;
            }

            attempts++;
        }

        throw new Error('Failed to generate unique phone number after 100 attempts');
    }

    /**
     * Find existing user by phone, email, or name+company
     */
    private static async findExistingUser(
        memberData: ExtractedMember
    ): Promise<mongoose.Document | null> {
        // Priority 1: Phone number (highest priority)
        if (memberData.phoneNumber) {
            const user = await User.findOne({ phoneNumber: memberData.phoneNumber });
            if (user) {
                console.log(`✅ Found existing user by phone: ${memberData.phoneNumber}`);
                return user;
            }
        }

        // Priority 2: Email
        if (memberData.email) {
            const user = await User.findOne({ email: memberData.email.toLowerCase() });
            if (user) {
                console.log(`✅ Found existing user by email: ${memberData.email}`);
                return user;
            }
        }

        // Priority 3: Name + Company (fallback)
        if (memberData.name && memberData.company) {
            const user = await User.findOne({
                name: { $regex: new RegExp(`^${memberData.name}$`, 'i') },
                company: { $regex: new RegExp(`^${memberData.company}$`, 'i') },
            });
            if (user) {
                console.log(`✅ Found existing user by name+company: ${memberData.name} at ${memberData.company}`);
                return user;
            }
        }

        return null;
    }

    /**
     * Create a new user from member data
     */
    private static async createNewUser(memberData: ExtractedMember): Promise<any> {
        // Generate phone number if missing
        let phoneNumber = memberData.phoneNumber;
        if (!phoneNumber) {
            phoneNumber = await this.generateUniquePhoneNumber();
            console.log(`📱 Generated phone number: ${phoneNumber}`);
        }

        // Generate email if missing (using phone number)
        const email = memberData.email || `user${phoneNumber}@waytree.temp`;

        const newUser = await User.create({
            name: memberData.name,
            email: email.toLowerCase(),
            company: memberData.company || undefined,
            oneLiner: memberData.bio || undefined,
            role: 'member',
            website: memberData.website || undefined,
            phoneNumber: phoneNumber,
            // Store LinkedIn in a custom field if your model supports it
            // For now, we can append it to the bio or website
        });

        console.log(`✅ Created new user: ${memberData.name} (${newUser._id})`);
        return newUser;
    }

    /**
     * Helper to clean text for embedding
     * Removes emojis/icons and normalizes whitespace
     */
    private static cleanTextForEmbedding(text: string): string {
        if (!text) return '';
        return text
            // Remove emojis & symbols (basic ranges)
            .replace(/[\u{1F600}-\u{1F6FF}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
            // Normalize all whitespace (newlines, tabs, multiple spaces) to single space
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Create member profile text for embedding
     * NOTE: Mobile number is NOT included in embedding text for privacy/security
     * It's stored in metadata and retrieved only when assistant needs it
     */
    private static createMemberProfileText(memberData: ExtractedMember): string {
        const parts = [
            `Name: ${memberData.name}`,
            memberData.company ? `Company: ${memberData.company}` : null,
            memberData.bio ? `Description: ${memberData.bio}` : null,
            // Mobile number excluded from embedding - stored only in metadata
        ].filter(Boolean);

        // Join with space instead of newline for "single chunk" feel
        const rawText = parts.join(' . ');

        return this.cleanTextForEmbedding(rawText);
    }

    /**
     * Add a single member to an event/community
     */
    static async addMemberToEvent(
        eventId: string,
        organizerId: string,
        memberInput: MemberInput,
        source: 'join' | 'manual' | 'excel' = 'manual'
    ): Promise<AddMemberResult> {
        try {
            // Step 1: Extract and validate member data
            const memberData = this.extractMemberData(memberInput);
            if (!memberData) {
                return {
                    success: false,
                    userId: '',
                    isNewUser: false,
                    embeddingCreated: false,
                    message: 'Invalid member data: name is required',
                };
            }

            // Step 2: Check if user exists
            let user = await this.findExistingUser(memberData);
            let isNewUser = false;

            // Step 3: Create user if doesn't exist
            if (!user) {
                user = await this.createNewUser(memberData);
                isNewUser = true;
            }

            const userId = (user as any)._id.toString();

            // Step 4: Add to event_members (check for duplicates)
            const existingMembership = await EventMember.findOne({
                eventId,
                userId,
            });

            if (existingMembership) {
                console.log(`ℹ️ User ${userId} already a member of event ${eventId}`);
                return {
                    success: true,
                    userId,
                    isNewUser: false,
                    embeddingCreated: false,
                    message: 'User already a member',
                };
            }

            await EventMember.create({
                eventId,
                organizerId,
                userId,
                name: memberData.name,
                phoneNumber: memberData.phoneNumber,
                source,
                joinedAt: new Date(),
            });

            console.log(`✅ Added member to event: ${memberData.name}`);

            // Step 5: Create and store embedding
            let embeddingCreated = false;
            try {
                const profileText = this.createMemberProfileText(memberData);
                const embedding = await EmbeddingService.generateEmbedding(profileText);

                if (embedding && embedding.length > 0) {
                    await SupabaseService.storeMemberProfile(
                        eventId,
                        userId,
                        profileText,
                        embedding,
                        {
                            name: memberData.name,
                            company: memberData.company,
                            bio: memberData.bio,
                            phoneNumber: memberData.phoneNumber,
                        }
                    );
                    embeddingCreated = true;
                    console.log(`✅ Created embedding for member: ${memberData.name}`);
                }
            } catch (embeddingError) {
                console.error('❌ Failed to create embedding:', embeddingError);
                // Don't fail the entire operation if embedding fails
            }

            return {
                success: true,
                userId,
                isNewUser,
                embeddingCreated,
                message: 'Member added successfully',
            };
        } catch (error) {
            console.error('❌ Error adding member:', error);
            return {
                success: false,
                userId: '',
                isNewUser: false,
                embeddingCreated: false,
                message: (error as Error).message,
            };
        }
    }

    /**
     * Add multiple members from JSON array
     */
    static async addMembersFromJSON(
        eventId: string,
        organizerId: string,
        members: MemberInput[],
        source: 'join' | 'manual' | 'excel' = 'manual'
    ): Promise<{
        success: boolean;
        totalProcessed: number;
        added: number;
        skipped: number;
        failed: number;
        results: AddMemberResult[];
    }> {
        const results: AddMemberResult[] = [];
        let added = 0;
        let skipped = 0;
        let failed = 0;

        for (const memberInput of members) {
            const result = await this.addMemberToEvent(eventId, organizerId, memberInput, source);
            results.push(result);

            if (result.success) {
                if (result.message === 'User already a member') {
                    skipped++;
                } else {
                    added++;
                }
            } else {
                failed++;
            }
        }

        return {
            success: true,
            totalProcessed: members.length,
            added,
            skipped,
            failed,
            results,
        };
    }

    /**
     * Update member profile and regenerate embedding
     */
    static async updateMemberProfile(
        eventId: string,
        userId: string,
        updates: Partial<ExtractedMember>
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Update user in database
            const user = await User.findByIdAndUpdate(userId, updates, { new: true });
            if (!user) {
                return { success: false, message: 'User not found' };
            }

            // Delete old embedding
            await SupabaseService.deleteMemberEmbedding(eventId, userId);

            // Create new embedding
            const memberData: ExtractedMember = {
                name: user.name,
                company: user.company || '',
                bio: user.oneLiner || '',
                phoneNumber: user.phoneNumber,
            };

            const profileText = this.createMemberProfileText(memberData);
            const embedding = await EmbeddingService.generateEmbedding(profileText);

            if (embedding && embedding.length > 0) {
                await SupabaseService.storeMemberProfile(eventId, userId, profileText, embedding, {
                    name: memberData.name,
                    company: memberData.company,
                    bio: memberData.bio,
                    phoneNumber: memberData.phoneNumber,
                });
            }

            return { success: true, message: 'Profile updated and embedding regenerated' };
        } catch (error) {
            console.error('❌ Error updating member profile:', error);
            return { success: false, message: (error as Error).message };
        }
    }

    /**
     * Remove member from event and delete embedding
     */
    static async removeMemberFromEvent(
        eventId: string,
        userId: string
    ): Promise<{ success: boolean; message: string }> {
        try {
            // Remove from event_members
            await EventMember.deleteOne({ eventId, userId });

            // Delete embedding
            await SupabaseService.deleteMemberEmbedding(eventId, userId);

            return { success: true, message: 'Member removed successfully' };
        } catch (error) {
            console.error('❌ Error removing member:', error);
            return { success: false, message: (error as Error).message };
        }
    }
}
