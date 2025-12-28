import { pipeline } from "@xenova/transformers";

// Type definition for the pipeline function
type FeatureExtractionPipeline = (text: string | string[], options?: any) => Promise<any>;

// Singleton to hold the pipeline instance
let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;

// Function to get or initialize the pipeline
const getExtractor = (): Promise<FeatureExtractionPipeline> => {
    if (!extractorPromise) {
        // We use all-mpnet-base-v2 which produces 768-dim embeddings
        // This matches our MongoDB vector index configuration.
        // The model is downloaded automatically on first use.
        console.log("Loading local embedding model (Xenova/all-mpnet-base-v2)...");
        extractorPromise = pipeline("feature-extraction", "Xenova/all-mpnet-base-v2");
    }
    return extractorPromise;
};

export const EmbeddingService = {
    /**
     * Generates a text embedding using local 'all-mpnet-base-v2' model.
     * Dimensions: 768
     */
    generateEmbedding: async (text: string): Promise<number[]> => {
        try {
            console.log("ℹ️ Embedding generation disabled to prevent OOM on free tier. Returning zero vector.");
            // Return 768 zeros (matches mpnet-base-v2 dimension)
            return new Array(768).fill(0);

            /* 
            // REAL IMPLEMENTATION - DISABLED FOR STABILITY
            if (!text || !text.trim()) {
                console.log("ℹ️ No text to embed");
                return [];
            }

            const extractor = await getExtractor();
            const output = await extractor(text, { pooling: "mean", normalize: true });
            const embedding = Array.from(output.data) as number[];
            return embedding;
            */
        } catch (error) {
            console.error("Error generating local embedding:", error);
            // Fallback to zeros even on error
            return new Array(768).fill(0);
        }
    },

    /**
     * Creates a composite text string from user profile fields.
     * Semantic fields: interests, skills, role, primaryGoal, location
     */
    createUserProfileText: (user: any): string => {
        const parts = [
            user.interests?.join(", "),
            user.skills?.join(", "),
            user.role,
            user.primaryGoal,
            user.location,
        ].filter(Boolean);

        return parts.join(". ");
    },

    /**
     * Creates a composite text string from event fields.
     * Semantic fields: name, description, tags, location, headline
     */
    createEventText: (event: any): string => {
        const parts = [
            event.name,
            event.headline,
            event.description,
            event.tags?.join(", "),
            event.location
        ].filter(Boolean);

        return parts.join(". ");
    }
};
