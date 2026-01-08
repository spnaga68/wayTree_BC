import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

// Initialize Gemini Client
const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export const EmbeddingService = {
    /**
     * Generates a text embedding using Gemini 'text-embedding-004'.
     * Dimensions: 768
     */
    generateEmbedding: async (text: string): Promise<number[]> => {
        try {
            if (!text || !text.trim()) {
                console.log("ℹ️ No text to embed");
                return [];
            }

            if (!genAI || !apiKey) {
                console.error("❌ GEMINI_API_KEY is missing. Cannot generate embedding.");
                return [];
            }

            console.log(`🔑 [DEBUG] Embedding using Key: ${apiKey.substring(0, 5)}...`);

            const model = genAI.getGenerativeModel({ model: "text-embedding-004" });

            // Generate embedding
            const result = await model.embedContent(text);
            const embedding = result.embedding.values;

            return embedding;
        } catch (error) {
            console.error("Error generating Gemini embedding:", error);
            // Fallback to empty array or throw
            return [];
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
            user.company,
            user.oneLiner // "About" section
        ].filter(Boolean);

        return parts.join(". ");
    },

    /**
     * Creates a composite text string from event basic metadata only.
     * Semantic fields: name, headline, description, tags, location
     */
    createEventMetadataText: (event: any): string => {
        const parts = [
            event.name,
            event.headline,
            event.description,
            event.tags?.join(", "),
            event.location
        ].filter(Boolean);

        return parts.join(". ");
    },

    /**
     * Creates a composite text string from event fields including PDF.
     * Semantic fields: name, description, tags, location, headline, pdfExtractedText
     */
    createEventText: (event: any): string => {
        const parts = [
            event.name,
            event.headline,
            event.description,
            event.tags?.join(", "),
            event.location,
            // Handle single or multiple extracted texts
            event.pdfExtractedText,
            ...(event.pdfExtractedTexts || [])
        ].filter(Boolean);

        return parts.join(". ");
    }
};
