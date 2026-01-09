import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { EmbeddingService } from "./embeddingService";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export type Intent = "METADATA" | "CONTENT" | "PERSONAL" | "MEMBER_DISCOVERY" | "GENERAL";

/* =========================================================
   INTENT CLASSIFICATION LOGIC
========================================================= */

const INTENT_CORPUS: Record<Intent, string[]> = {
    METADATA: [
        "Where is the event", "What is the venue", "When does the event start",
        "Date of the event", "Duration", "Is this online", "start time", "end time",
        "location", "address", "map", "meeting link"
    ],
    CONTENT: [
        "What will I learn", "Topics covered", "Event agenda", "Speakers list",
        "Workshops", "Key takeaways", "schedule", "sessions", "curriculum"
    ],
    PERSONAL: [
        "Is this event useful for me", "Should I attend", "Relevant to my profile",
        "Good for my role", "Help my career", "suitable for beginners", "worth my time"
    ],
    MEMBER_DISCOVERY: [
        "Any investors attending", "Who is attending", "List of participants",
        "Meet founders", "Looking for collaborators", "any students", "who else is coming",
        "network with people", "find someone", "connect with"
    ],
    GENERAL: [
        "Tell me about this event", "Give me an overview", "Explain the event", "Hi", "Hello"
    ]
};

let intentVectors: { intent: Intent; vector: number[] }[] = [];

/**
 * Call ONCE at server startup to pre-compute embeddings
 */
export async function initializeIntentClassifier() {
    intentVectors = [];
    console.log("🔄 Initializing Intent Classifier (Pre-computing embeddings)...");

    // Check if API key is present
    if (!process.env.GEMINI_API_KEY) {
        console.warn("⚠️ GEMINI_API_KEY missing. Intent classifier will rely on rule-based logic only.");
        return;
    }

    try {
        for (const intent in INTENT_CORPUS) {
            const phrases = INTENT_CORPUS[intent as Intent];
            // Process in parallel chunks to speed up startup
            const promises = phrases.map(async (example) => {
                try {
                    const embedding = await EmbeddingService.generateEmbedding(example);
                    return { intent: intent as Intent, vector: embedding };
                } catch (e) {
                    return null;
                }
            });

            const results = await Promise.all(promises);
            results.forEach(r => {
                if (r) intentVectors.push(r);
            });
        }
        console.log(`✅ Intent classifier initialized with ${intentVectors.length} semantic samples.`);
    } catch (err) {
        console.error("❌ Failed to initialize intent classifier:", err);
    }
}

function cosineSimilarity(a: number[], b: number[]) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        na += a[i] * a[i];
        nb += b[i] * b[i];
    }
    return (na === 0 || nb === 0) ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function ruleBasedIntent(question: string): Intent | null {
    const q = question.toLowerCase().trim();
    if (/(where|when|date|time|venue|location|address|start|end|map|place)/.test(q)) return "METADATA";
    if (/(investor|funding|mentor|attend|participants|members|people|connect|who|meet|coming|else)/.test(q)) return "MEMBER_DISCOVERY";
    if (/(for me|useful|should i|relevant|profile|worth|benefit|my role|career)/.test(q)) return "PERSONAL";
    if (/(learn|agenda|topics|speakers|workshop|schedule|track|session|curriculum)/.test(q)) return "CONTENT";
    return null;
}

async function semanticIntent(question: string): Promise<{ intent: Intent; score: number }> {
    try {
        const queryVec = await EmbeddingService.generateEmbedding(question);
        let bestIntent: Intent = "GENERAL";
        let bestScore = 0;

        for (const item of intentVectors) {
            const score = cosineSimilarity(queryVec, item.vector);
            if (score > bestScore) {
                bestScore = score;
                bestIntent = item.intent;
            }
        }
        return { intent: bestIntent, score: bestScore };
    } catch (e) {
        console.error("Semantic intent determination failed:", e);
        return { intent: "GENERAL", score: 0 };
    }
}

export async function classifyIntent(question: string): Promise<Intent> {
    // 1️⃣ Rule-based (Fastest, High Precision for keywords)
    const ruleIntent = ruleBasedIntent(question);
    if (ruleIntent) {
        // console.log(`🔍 Rule Matched: ${ruleIntent}`); // Optional debug
        return ruleIntent;
    }

    // 2️⃣ Semantic (Fallback for nuance)
    if (intentVectors.length > 0) {
        const semantic = await semanticIntent(question);
        // User requested strict threshold, DO NOT lower blindly below 0.5
        if (semantic.score >= 0.55) {
            return semantic.intent;
        }
    }

    return "GENERAL";
}

/* =========================================================
   SERVICE IMPLEMENTATION
========================================================= */

export interface EventAssistantResponse {
    answer: string;
    relevantInfo: string[];
    confidence: number;
}

export const EventAssistantService = {
    askEventAssistant: async (
        question: string,
        event: any,
        userProfile: any,
        _conversationHistory: any[] = []
    ): Promise<EventAssistantResponse> => {
        try {
            console.log(`🤖 EventAssistant: Processing "${question}"`);

            // 1. CLASSIFY INTENT
            const intent = await classifyIntent(question);
            console.log(`🔍 Intent Classified: ${intent}`);

            // 2. EXECUTE FLOW
            if (intent === "MEMBER_DISCOVERY") {
                console.log("👥 Executing Member Discovery Flow");
                if (!event.attendees || event.attendees.length === 0) {
                    return { answer: "I couldn't find any other members attending this event yet.", relevantInfo: [], confidence: 90 };
                }

                // Generate embedding for query
                const queryVector = await EmbeddingService.generateEmbedding(question);

                // Fetch members
                const { User } = await import("../models/User");
                const members = await User.find({
                    _id: { $in: event.attendees },
                    profileEmbedding: { $exists: true, $ne: [] }
                }).select('name oneLiner role phoneNumber profileEmbedding company');

                // Similarity Search (Sorted by Score Descending)
                console.log(`🔍 [DEBUG] Member Discovery: Comparing "${question}" against ${members.length} attendees.`);

                const results = members
                    .map(m => {
                        const score = cosineSimilarity(queryVector, m.profileEmbedding || []);
                        return { m, score };
                    })
                    .sort((a, b) => b.score - a.score); // DESCENDING sort

                // Debug scores
                results.forEach(r => console.log(`   - ${r.m.name}: ${r.score.toFixed(4)}`));

                // Strict Threshold Filtering (0.45 threshold, Top 5)
                // If the question is just looking for "investors", the semantic match should be high for investors.
                let filtered = results.filter(item => item.score >= 0.45);

                if (filtered.length === 0) {
                    // Fallback: Top 2 if > 0.25 (User asked for safer logic, this ensures we don't return junk but also don't fail silently)
                    filtered = results.filter(item => item.score >= 0.25).slice(0, 2);
                } else {
                    filtered = filtered.slice(0, 5);
                }

                if (filtered.length === 0) {
                    return {
                        answer: "I checked the attendee list, but I couldn't find anyone specifically matching that criteria.",
                        relevantInfo: [],
                        confidence: 85
                    };
                }

                const responseLines = filtered.map(item => {
                    const m = item.m;
                    const desc = m.oneLiner || m.role || (m.company ? `Works at ${m.company}` : "Event Attendee");
                    return `• **${m.name}**\n  ${desc}`;
                });

                return {
                    answer: `Here are some members you might want to connect with:\n\n${responseLines.join("\n\n")}`,
                    relevantInfo: [`Found ${filtered.length} matches.`],
                    confidence: 95
                };
            }

            if (intent === "METADATA") {
                const answer = `
                 **Date:** ${event.dateTime ? new Date(event.dateTime).toLocaleString() : 'TBD'}
                 **Venue:** ${event.location || "TBD"}
                 `;
                return { answer: answer.trim(), relevantInfo: ["Metadata retrieved directly"], confidence: 100 };
            }

            // CONTENT / PERSONAL (RAG)
            let contextChunks = "";
            let relevantInfo: string[] = [];

            // RAG logic for Content/Personal/General
            if (event.pdfChunks && event.pdfChunks.length > 0) {
                try {
                    const queryEmbedding = await EmbeddingService.generateEmbedding(question);
                    const scoredChunks = event.pdfChunks.map((chunk: any) => ({
                        text: chunk.text,
                        score: cosineSimilarity(queryEmbedding, chunk.embedding)
                    })).sort((a: any, b: any) => b.score - a.score).slice(0, 5);

                    contextChunks = scoredChunks.map((c: any) => `- ${c.text}`).join("\n\n");
                    if (scoredChunks.length > 0) relevantInfo.push("Retrieved PDF context");
                } catch (e) {
                    console.error("RAG retrieval failed:", e);
                }
            }

            // GENERATE ANSWER
            let systemPrompt = "";
            let userContent = "";

            if (intent === "CONTENT") {
                systemPrompt = "You are a helpful Event Assistant. Answer the user's question regarding specific event details (agenda, topics, etc). Use ONLY the provided PDF CONTENT. If the answer is not in the context, state that.";
                userContent = `PDF CONTENT:\n${contextChunks}\n\nQUESTION: ${question}`;
            } else if (intent === "PERSONAL") {
                systemPrompt = "You are an advisor. Give a strict recommendation based on the USER PROFILE and PDF CONTENT. Keep it short.";
                const userProfileText = `Name: ${userProfile.name}, Role: ${userProfile.role}, Interests: ${userProfile.interests?.join(", ")}`;
                userContent = `PDF CONTENT:\n${contextChunks}\n\nUSER PROFILE:\n${userProfileText}\n\nQUESTION: ${question}`;
            } else {
                systemPrompt = `You are a helpful assistant for the event "${event.name}". Answer politely and briefly.`;
                userContent = `CONTEXT:\n${contextChunks}\n\nQUESTION: ${question}`;
            }

            if (!genAI) return { answer: "AI service unavailable (Check API Key).", relevantInfo: [], confidence: 0 };

            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const finalPrompt = `${systemPrompt}\n\n${userContent}`;
            const result = await model.generateContent(finalPrompt);
            const finalAnswer = result.response.text();

            return { answer: finalAnswer, relevantInfo, confidence: 85 };

        } catch (error: any) {
            console.error("❌ Gemini Error:", error);
            return { answer: "I'm having trouble connecting to the event assistant right now.", relevantInfo: [], confidence: 0 };
        }
    },
    getSuggestedQuestions: (_event: any, _userProfile: any): string[] => {
        return ["What is the agenda?", "Is this relevant for me?", "Who are the speakers?", "Where is it involved?"];
    }
};
