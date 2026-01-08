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
            // 1️⃣ CLASSIFY INTENT (Rule-Based + Keyword Expansion)
            const lowerQ = question.toLowerCase();
            let intent = "GENERAL";

            const metadataKeywords = ["where", "when", "venue", "location", "date", "time", "duration", "deadline"];
            const contentKeywords = ["learn", "agenda", "session", "topic", "speaker", "workshop", "outcome", "schedule", "what will i", "track"];
            const personalKeywords = ["for me", "useful", "benefit", "my profile", "should i", "relevant", "worth", "fit"];
            const memberKeywords = [
                "investor", "investors", "mentor", "mentors", "funding",
                "who is coming", "who is attending", "participants", "attendees",
                "meet", "connect", "find someone", "looking for", "networking",
                "anyone", "any members", "any people", "is there", "are there", "does any",
                "who else", "search for", "find"
            ];

            if (metadataKeywords.some(k => lowerQ.includes(k))) {
                intent = "METADATA";
            } else if (memberKeywords.some(k => lowerQ.includes(k))) {
                intent = "MEMBER_DISCOVERY";
            } else if (contentKeywords.some(k => lowerQ.includes(k))) {
                intent = "CONTENT";
            } else if (personalKeywords.some(k => lowerQ.includes(k))) {
                intent = "PERSONAL";
            }

            console.log(`🔍 Intent Classified (Deterministic): ${intent}`);

            // 2️⃣ EXECUTE FLOW BASED ON INTENT

            // FLOW: MEMBER DISCOVERY
            if (intent === "MEMBER_DISCOVERY") {
                console.log("👥 Executing Member Discovery Flow");
                if (!event.attendees || event.attendees.length === 0) {
                    return {
                        answer: "I couldn't find any other members attending this event yet.",
                        relevantInfo: [],
                        confidence: 90
                    };
                }

                // 1. Generate Query Embedding
                const { EmbeddingService } = await import("./embeddingService");
                const queryVector = await EmbeddingService.generateEmbedding(question);

                // 2. Fetch Members
                const { User } = await import("../models/User");
                const members = await User.find({
                    _id: { $in: event.attendees },
                    profileEmbedding: { $exists: true, $ne: [] }
                }).select('name oneLiner role phoneNumber profileEmbedding company');

                // 3. Similarity Search
                // 3. Similarity Search (Sorted by Score Descending)
                const cosineSimilarity = (vecA: number[], vecB: number[]) => {
                    let dot = 0.0, normA = 0.0, normB = 0.0;
                    for (let i = 0; i < vecA.length; i++) {
                        dot += vecA[i] * vecB[i];
                        normA += vecA[i] * vecA[i];
                        normB += vecB[i] * vecB[i];
                    }
                    return (normA === 0 || normB === 0) ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
                };

                console.log(`🔍 [DEBUG] Member Discovery: Comparing "${question}" against ${members.length} attendees.`);

                const results = members
                    .map(m => {
                        const score = cosineSimilarity(queryVector, m.profileEmbedding || []);
                        return { m, score };
                    })
                    .sort((a, b) => b.score - a.score); // DESCENDING sort by score (Highest first)

                // Debug scores
                results.forEach(r => console.log(`   - ${r.m.name}: ${r.score.toFixed(4)}`));

                // Filter Strategy:
                // 1. Strict Threshold: Only take matches > 0.45 (increased from 0.35 for stricter relevance)
                // 2. Fallback: If no strict matches, take top 2 IF valid score (>0.2)

                let filtered = results.filter(item => item.score >= 0.45);

                if (filtered.length === 0) {
                    // Fallback to top 2 best matches if they are at least decent
                    filtered = results.filter(item => item.score >= 0.25).slice(0, 2);
                } else {
                    // Limit to top 5 strictly relevant
                    filtered = filtered.slice(0, 5);
                }

                if (filtered.length === 0) {
                    console.log("⚠️ No members met the similarity threshold.");
                    return {
                        answer: "I checked the attendee list, but I couldn't find anyone specifically matching that criteria.",
                        relevantInfo: [],
                        confidence: 85
                    };
                }

                // 4. Construct Response
                const responseLines = filtered.map(item => {
                    const m = item.m;
                    // Format: **Name** (Role/Company) - Score debug
                    const desc = m.oneLiner || m.role || (m.company ? `Works at ${m.company}` : "Event Attendee");
                    // removed contact number for privacy in general chat usually, but keeping if requested
                    return `• **${m.name}**\n  ${desc}`;
                });

                return {
                    answer: `Here are some members you might want to connect with:\n\n${responseLines.join("\n\n")}`,
                    relevantInfo: [`Found ${results.length} matches based on profile similarity.`],
                    confidence: 95
                };
            }

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

            let finalAnswer = "I couldn't generate an answer.";
            const models = ["gemini-2.0-flash-exp", "gemini-1.5-flash", "gemini-pro"];
            const finalPrompt = `${systemPrompt}\n\n${userContent}`;

            for (const modelName of models) {
                try {
                    const model = genAI.getGenerativeModel({ model: modelName });
                    const result = await model.generateContent(finalPrompt);
                    const response = await result.response;
                    finalAnswer = response.text();
                    if (finalAnswer) break;
                } catch (e: any) {
                    console.log(`⚠️ ${modelName} failed: ${e.message}`);
                    if (modelName === models[models.length - 1]) throw e;
                }
            }

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
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
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
