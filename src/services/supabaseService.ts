import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Ensure env is loaded
const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

// Singleton Supabase Client
class SupabaseService {
    private static instance: any = null;

    private static getClient() {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
            console.warn("⚠️ Supabase credentials missing. RAG storage will fail.");
            return null;
        }

        if (!this.instance) {
            this.instance = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        }
        return this.instance;
    }

    /**
     * Store Event Document Chunk Embeddings
     */
    static async storeEventDocChunk(eventId: string, text: string, embedding: number[], chunkIndex: number) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .insert({
                event_id: eventId,
                category: 'doc',
                content: text, // Raw text
                chunks: text,  // Chunk text (same for docs)
                embedding: embedding,
                chunk_index: chunkIndex,
                extra_metadata: { chunk_index: chunkIndex }
            });

        if (error) console.error("❌ [Supabase] Failed to store Doc Chunk:", error);
    }

    /**
     * Store Event Metadata Embedding
     */
    static async storeEventMetadata(eventId: string, text: string, embedding: number[], metadata: any) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .insert({
                event_id: eventId,
                category: 'meta',
                content: JSON.stringify(metadata), // Structured data
                chunks: text, // The summary text
                embedding: embedding,
                extra_metadata: metadata
            });

        if (error) console.error("❌ [Supabase] Failed to store Metadata:", error);
    }

    /**
     * Store Member Profile Embedding
     */
    static async storeMemberProfile(eventId: string, userId: string, text: string, embedding: number[], profileData: any) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .insert({
                event_id: eventId,
                category: 'member',
                content: JSON.stringify(profileData), // Store the pure JSON data in content
                chunks: text, // Store the profile string in chunks
                embedding: embedding,
                extra_metadata: { user_id: userId, ...profileData }
            });

        if (error) console.error("❌ [Supabase] Failed to store Member Profile:", error);
    }

    /**
     * Unified Semantic Search against 'event_embeddings'
     * @param {number[]} embedding - Query embedding vector
     * @param {string} eventId - Event to filter by
     * @param {string} category - 'meta', 'doc', or 'member'
     * @param {number} matchCount - Number of matches to return (default: 5)
     * @param {number} threshold - Minimum similarity (default 0.5)
     */
    static async searchEventEmbeddings(
        embedding: number[],
        eventId: string,
        category: 'meta' | 'doc' | 'member',
        matchCount: number = 5,
        threshold: number = 0.5
    ) {
        const client = this.getClient();
        if (!client) return [];

        // Debug Log to PROVE strict filtering
        console.log(`   🔍 [Supabase] Searching '${category}' in Event: ${eventId}`);

        const { data, error } = await client.rpc('match_event_embeddings', {
            query_embedding: embedding,
            similarity_threshold: threshold,
            match_count: matchCount,
            filter_event_id: eventId,
            filter_category: category
        });

        if (error) {
            console.error(`❌ [Supabase] Search failed for category '${category}':`, error);
            return [];
        }

        return data || [];
    }

    /**
     * Delete Member Embedding
     */
    static async deleteMemberEmbedding(eventId: string, userId: string) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .delete()
            .eq('event_id', eventId)
            // Use arrow operator for JSONB access: extra_metadata ->> user_id
            .eq('extra_metadata->>user_id', userId)
            .eq('category', 'member');

        if (error) console.error("❌ [Supabase] Failed to delete member embedding:", error);
    }

    /**
     * Delete all embeddings for an event (Clean up)
     */
    static async deleteEventEmbeddings(eventId: string) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .delete()
            .eq('event_id', eventId);

        if (error) console.error("❌ [Supabase] Failed to delete event embeddings:", error);
    }
}

export { SupabaseService };
