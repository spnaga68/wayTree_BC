import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

const envPath = path.join(__dirname, '../../.env');
dotenv.config({ path: envPath });

class SupabaseService {
    private static instance: any = null;

    private static getClient() {
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
            console.warn("⚠️ Supabase credentials missing. Semantic search will fail.");
            return null;
        }
        if (!this.instance) {
            this.instance = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        }
        return this.instance;
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
     * Store Member Profile (Useful for internal updates if needed)
     */
    static async storeMemberProfile(eventId: string, userId: string, text: string, embedding: number[], profileData: any) {
        const client = this.getClient();
        if (!client) return;

        const { error } = await client
            .from('event_embeddings')
            .insert({
                event_id: eventId,
                category: 'member',
                content: text,
                embedding: embedding,
                extra_metadata: { user_id: userId, ...profileData }
            });

        if (error) console.error("❌ [Supabase] Failed to store Member Profile:", error);
    }
}

export { SupabaseService };
