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

    // 1. CONTENT (High Priority - Speakers, Agenda)
    if (/\b(learn|agenda|topics?|speakers?|workshops?|schedule|track|sessions?|curriculum|takeaways?|what\s+will\s+i)\b/.test(q)) {
        return "CONTENT";
    }

    // 2. MEMBER_DISCOVERY (Priority > Metadata)
    // Explicitly matches 'how many', 'who is attending', 'list', etc.
    if (/\b(who|investors?|founders?|fund(ing|ers)|mentors?|attends?|attending|attendees?|participants?|members?|people|connect|meet|coming|else|list|how\s+many)\b/.test(q)) {
        return "MEMBER_DISCOVERY";
    }

    // 3. METADATA (Location, Time)
    // Uses \b to prevent partial matches (e.g. 'end' matching inside 'attending')
    if (/\b(where|when|date|time|venue|location|address|starts?|ends?|map|place|duration|deadline)\b/.test(q)) {
        return "METADATA";
    }

    // 4. PERSONAL
    if (/\b(for\s+me|useful|should\s+i|relevant|profile|worth|benefit|my\s+role|career)\b/.test(q)) {
        return "PERSONAL";
    }

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

async function geminiFallbackIntent(question: string): Promise<Intent> {
    if (!genAI) return "GENERAL";

    const prompt = `
    Classify the user's question into ONE intent.
    Allowed intents: METADATA, CONTENT, PERSONAL, MEMBER_DISCOVERY, GENERAL
    Rules: Respond with ONLY the intent name. No explanation.
    Question: "${question}"
    `;

    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const res = await model.generateContent(prompt);
        const text = res.response.text().trim().toUpperCase();
        if (["METADATA", "CONTENT", "PERSONAL", "MEMBER_DISCOVERY", "GENERAL"].includes(text)) {
            return text as Intent;
        }
    } catch (e) {
        console.error("Gemini Intent Fallback failed:", e);
    }
    return "GENERAL";
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

    // 3️⃣ Gemini Fallback (Slow but Smarter - Last Resort)
    console.log("⚠️ Low semantic confidence. Falling back to Gemini LLM for intent...");
    return await geminiFallbackIntent(question);
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
                const totalCount = event.attendees ? event.attendees.length : 0;

                // Handle "How many" / "Count" explicitly (Still rely on Mongo for absolute count)
                if (/\b(how\s+many|count|total|number\s+of)\b/i.test(question)) {
                    return {
                        answer: `There are currently ${totalCount} members attending this event.`,
                        relevantInfo: [`Total attendees: ${totalCount}`],
                        confidence: 100
                    };
                }

                // Generate embedding for query
                const queryVector = await EmbeddingService.generateEmbedding(question);

                // Fetch Semantic Matches from Supabase (Members)
                const { SupabaseService } = await import("./supabaseService");
                const results = await SupabaseService.searchEventEmbeddings(
                    queryVector,
                    event._id.toString(),
                    'member',
                    10, // Fetch top 10 potential matches
                    0.25 // Base threshold
                );

                console.log(`🔍 [DEBUG] Member Discovery: Found ${results.length} semantic matches.`);

                let filtered = results;

                // Strict Threshold Filtering Logic (similar to previous but applied to retrieval results)
                const highConfidence = results.filter((r: any) => r.similarity >= 0.45);

                if (highConfidence.length > 0) {
                    filtered = highConfidence.slice(0, 5); // Top 5 relevant
                } else {
                    // Fallback: Top 2 if > 0.25
                    filtered = results.filter((r: any) => r.similarity >= 0.25).slice(0, 2);
                }

                if (filtered.length === 0) {
                    return {
                        answer: "I checked the attendee list, but I couldn't find anyone specifically matching that criteria.",
                        relevantInfo: [],
                        confidence: 85
                    };
                }

                const responseLines = filtered.map((item: any) => {
                    const meta = item.extra_metadata || {};
                    const name = meta.name || "Member";
                    const desc = meta.oneLiner || meta.role || (meta.company ? `Works at ${meta.company}` : "Event Attendee");
                    return `• **${name}**\n  ${desc}`;
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

            // RAG logic: Fetch Docs from Supabase
            try {
                const queryEmbedding = await EmbeddingService.generateEmbedding(question);
                const { SupabaseService } = await import("./supabaseService");

                const docResults = await SupabaseService.searchEventEmbeddings(
                    queryEmbedding,
                    event._id.toString(),
                    'doc',
                    5, // Top 5 chunks
                    0.4 // Moderate threshold
                );

                if (docResults.length > 0) {
                    contextChunks = docResults.map((c: any) => `- ${c.content}`).join("\n\n");
                    relevantInfo.push(`Retrieved ${docResults.length} relevant context chunks.`);
                    console.log(`📄 Retrieved ${docResults.length} chunks from Supabase.`);
                } else {
                    // Fallback: Try Metadata embedding if no docs found
                    const metaResults = await SupabaseService.searchEventEmbeddings(queryEmbedding, event._id.toString(), 'meta', 1, 0.4);
                    if (metaResults.length > 0) {
                        contextChunks = metaResults[0].content;
                        relevantInfo.push("Used Event Metadata summary.");
                    }
                }
            } catch (e) {
                console.error("RAG retrieval failed:", e);
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
