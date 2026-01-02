import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface EventAssistantResponse {
    answer: string;
    relevantInfo: string[];
    confidence: number;
}

export const EventAssistantService = {
    /**
     * Event Assistant Chatbot using Google Gemini
     */
    askEventAssistant: async (
        question: string,
        event: any,
        userProfile: any,
        _conversationHistory: any[] = []
    ): Promise<EventAssistantResponse> => {
        try {
            console.log(`🤖 EventAssistant: Processing "${question}"`);

            // 1️⃣ CLASSIFY INTENT
            // 1️⃣ CLASSIFY INTENT (Rule-Based, No LLM)
            const lowerQ = question.toLowerCase();
            let intent = "GENERAL";

            const metadataKeywords = ["where", "when", "venue", "location", "date", "time", "duration", "deadline"];
            const contentKeywords = ["learn", "agenda", "session", "topic", "speaker", "workshop", "outcome", "schedule", "what will i", "track"];
            const personalKeywords = ["for me", "useful", "benefit", "my profile", "should i", "relevant", "worth", "fit"];

            if (metadataKeywords.some(k => lowerQ.includes(k))) {
                intent = "METADATA";
            } else if (contentKeywords.some(k => lowerQ.includes(k))) {
                intent = "CONTENT";
            } else if (personalKeywords.some(k => lowerQ.includes(k))) {
                intent = "PERSONAL";
            }

            console.log(`🔍 Intent Classified (Deterministic): ${intent}`);

            // 2️⃣ EXECUTE FLOW BASED ON INTENT
            if (intent === "METADATA") {
                // FLOW 1: METADATA (Structured Data Only)
                console.log("⚡ Executing Metadata Flow");
                const answer = `
                **Date:** ${event.dateTime ? new Date(event.dateTime).toLocaleString() : 'TBD'}
                **Location:** ${event.location}
                **Venue:** ${event.location}
                `;
                return {
                    answer: answer.trim(),
                    relevantInfo: ["Metadata retrieved directly from database"],
                    confidence: 100
                };
            }

            let contextChunks = "";
            let relevantInfo: string[] = [];

            if (intent === "CONTENT" || intent === "PERSONAL") {
                // FLOW 2 & 3: RAG Retrieval
                console.log("📚 Executing RAG Flow for Content/Personal");

                // 1. Embed Question
                // Note: We need to import the EmbeddingService here. 
                // Since this is a static method in an object, we can import it dynamically or assume it's available.
                const { EmbeddingService } = await import("./embeddingService");
                const queryEmbedding = await EmbeddingService.generateEmbedding(question);

                // 2. Vector Search on PDF Chunks (in-memory filtering for now, or DB aggregation)
                // Since 'event' object is passed in, we access its chunks directly if populated.
                // In a production scenario with large datasets, you'd do a DB aggregation.
                // Here we assume event.pdfChunks is available.

                if (event.pdfChunks && event.pdfChunks.length > 0) {
                    const chunks = event.pdfChunks;

                    // Cosine Similarity
                    const scoredChunks = chunks.map((chunk: any) => {
                        const score = cosineSimilarity(queryEmbedding, chunk.embedding);
                        return { text: chunk.text, score };
                    });

                    // Sort and Top-K
                    scoredChunks.sort((a: any, b: any) => b.score - a.score);
                    const topChunks = scoredChunks.slice(0, 5); // Top 5

                    contextChunks = topChunks.map((c: any) => `- ${c.text}`).join("\n\n");
                    relevantInfo = topChunks.map(() => "Contains relevant info");
                    console.log(`📄 Retrieved ${topChunks.length} chunks from PDF`);
                } else {
                    console.log("⚠️ No PDF chunks found for this event.");
                }
            }

            // 3️⃣ GENERATE ANSWER (LLM)
            // Different prompts for Content vs Personal

            let systemPrompt = "";
            let userContent = "";

            if (intent === "CONTENT") {
                systemPrompt = `You are a helpful Event Assistant. Answer the user's question regarding specific event details (agenda, topics, etc).
                Use ONLY the provided "PDF CONTENT" context.
                If the answer is not in the context, state "The event details do not mention this."
                Keep your answer short, concise (max 2-3 sentences), and direct. No filler words.`;

                userContent = `PDF CONTENT:\n${contextChunks}\n\nQUESTION: ${question}`;

            } else if (intent === "PERSONAL") {
                systemPrompt = `You are a helpful advisor. The user is asking if this event is relevant to them.
                Reason based on the "PDF CONTENT" and "USER PROFILE".
                Give a strict "Yes" or "No" recommendation followed by one sentence explaining why. Keep it very short.`;

                const userProfileText = `Name: ${userProfile.name}, Role: ${userProfile.role}, Interests: ${userProfile.interests?.join(", ")}`;
                userContent = `PDF CONTENT:\n${contextChunks}\n\nUSER PROFILE:\n${userProfileText}\n\nQUESTION: ${question}`;

            } else {
                // General/Fallthrough
                systemPrompt = `You are a helpful assistant for the event "${event.name}". Answer politely and briefly (1 sentence).`;
                userContent = `QUESTION: ${question}`;
            }

            if (!genAI) {
                console.error("❌ GEMINI_API_KEY is missing.");
                return {
                    answer: "I'm having trouble connecting to the AI service. Please check configuration.",
                    relevantInfo: [],
                    confidence: 0
                };
            }

            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const finalPrompt = `${systemPrompt}\n\n${userContent}`;

            const result = await model.generateContent(finalPrompt);
            const response = await result.response;
            const finalAnswer = response.text() || "I couldn't generate an answer.";

            return {
                answer: finalAnswer,
                relevantInfo: relevantInfo,
                confidence: 85
            };

        } catch (error: any) {
            console.error("❌ Gemini Error:", error);
            return {
                answer: "I'm having trouble connecting to the event assistant right now. Please try again later.",
                relevantInfo: [],
                confidence: 0
            };
        }
    },

    getSuggestedQuestions: (_event: any, _userProfile: any): string[] => {
        return [
            "What is the agenda?",
            "Is this relevant for me?",
            "Who are the speakers?",
            "Where is it involved?"
        ];
    }
};

// Utility for cosine similarity
function cosineSimilarity(vecA: number[], vecB: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
