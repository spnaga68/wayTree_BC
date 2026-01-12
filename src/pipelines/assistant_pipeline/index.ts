import { GoogleGenerativeAI } from "@google/generative-ai";
import { EmbeddingService } from "../../services/embeddingService";
import { SupabaseService } from "../../services/supabaseService";
import { Event } from "../../models/Event";
import EventMember from "../../models/EventMember";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

export class AssistantPipeline {

    /**
     * Step 1: Hybrid Intent Classification
     * Uses strict keyword rules first (Cost Optimized), falls back to Gemini 2.0.
     */
    private static async classifyIntent(question: string): Promise<'MEMBER_SEARCH' | 'EVENT_INFO' | 'GENERAL'> {
        const q = question.toLowerCase().trim();

        // --- RULE BASED (Priority 1) ---

        // MEMBER_SEARCH Rules
        // Covers: "Who is...", "Are there...", "Find me...", "List of...", "How many..."
        if (/\b(who|investors?|founders?|ceo|cto|cmo|manufacturers?|companies|startup|business|role|job|hiring|people|person|attend(ing|ees)?|participants?|members?|connect|meet|network|list)\b/i.test(q)) {
            return 'MEMBER_SEARCH';
        }

        // EVENT_INFO Rules
        // Covers: "When...", "Where...", "Agenda...", "Topics...", "About..."
        if (/\b(when|where|time|date|venue|location|place|address|agenda|schedule|topic|subject|learn|session|speaker|talk|start|end|duration|program|about this event|what is)\b/i.test(q)) {
            return 'EVENT_INFO';
        }

        // GENERAL Rules (Simple greetings)
        if (/^(hi|hello|hey|greetings|thanks|thank you|good (morning|afternoon|evening))\b/i.test(q)) {
            return 'GENERAL';
        }

        // --- GEMINI FALLBACK (Priority 2) ---
        if (!genAI) return 'GENERAL';

        console.log("   ⚠️ Rule-based classification uncertain, using Gemini 2.0...");
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
        const prompt = `
        Classify query into strictly ONE category:
        1. MEMBER_SEARCH: people, companies, roles, counts (e.g., "Any oil manufacturers?", "Who is CEO?", "How many people?")
        2. EVENT_INFO: agenda, logistics, topics (e.g., "When does it start?", "Venue?", "What is this?")
        3. GENERAL: greetings, unrelated

        Return ONLY the category name.
        Query: "${question}"
        Category:`;

        try {
            const result = await model.generateContent(prompt);
            const text = result.response.text().trim().toUpperCase();
            if (text.includes('MEMBER')) return 'MEMBER_SEARCH';
            if (text.includes('EVENT')) return 'EVENT_INFO';
            return 'GENERAL';
        } catch (e) {
            console.warn("⚠️ Intent fallback failed, defaulting to GENERAL");
            return 'GENERAL';
        }
    }

    /**
     * Step 2: Ask Question with Strict Retrieval & DB Optimization
     */
    static async askQuestion(eventId: string, question: string, userId?: string): Promise<{ answer: string; sources: any[] }> {
        console.log(`\n🤖 [ASSISTANT] Processing: "${question}"`);
        console.log(`   🔒 Access Scope: EventId=${eventId}, UserId=${userId || 'Guest'}`);

        if (!eventId) {
            return { answer: "Error: No Event Context provided.", sources: [] };
        }

        if (!genAI) {
            return { answer: "I'm sorry, I'm currently offline (API Key missing).", sources: [] };
        }

        try {
            // 1. CLASSIFY INTENT
            const intent = await this.classifyIntent(question);
            console.log(`   🧠 Intent: ${intent}`);

            const q = question.toLowerCase();
            let contextText = "";
            let sources: any[] = [];

            // 2. RETRIEVAL & DIRECT ANSWERS

            // CASE A: GENERAL (No Search)
            if (intent === 'GENERAL') {
                return {
                    answer: "Hello! I am your Event Assistant. Ask me about the event details, agenda, or attendees.",
                    sources: []
                };
            }

            // CASE B: MEMBER SEARCH
            if (intent === 'MEMBER_SEARCH') {
                // Optimization: Direct DB Count
                if (/\b(how many|count|total|number of)\b/i.test(q)) {
                    const count = await EventMember.countDocuments({ eventId });
                    return {
                        answer: `There are currently ${count} members attending this event.`,
                        sources: [{ category: 'db_count', snippet: `Total: ${count}` }]
                    };
                }

                // Strict Embedding Search (Only Members)
                console.log("   🔍 Searching Member Embeddings...");
                const embedding = await EmbeddingService.generateEmbedding(question);
                const matches = await SupabaseService.searchEventEmbeddings(embedding, eventId, 'member', 10, 0.45);

                if (matches.length === 0) {
                    return { answer: "No matching members found.", sources: [] };
                }

                sources = matches;
                contextText = matches.map((m: any) => `[MEMBER] ${m.chunks}`).join("\n\n");
            }

            // CASE C: EVENT INFO
            if (intent === 'EVENT_INFO') {
                // Optimization: Direct DB Metadata lookup
                // If asking strictly about time/location (and not "agenda"), try DB first
                if (/\b(when|time|date|start|end|venue|location|where|address)\b/i.test(q) && !/\b(agenda|topic)\b/i.test(q)) {
                    const event = await Event.findById(eventId).select('name dateTime location');
                    if (event) {
                        const dateStr = event.dateTime ? new Date(event.dateTime).toLocaleString() : 'TBD';
                        const locStr = event.location || 'TBD';
                        // We still pass this to LLM to phrase it nicely, or return directly?
                        // User asked "Answer directly from database fields... for date, time, venue".
                        // Direct answer is safest and fastest.
                        return {
                            answer: `The event is located at ${locStr}. It is scheduled for ${dateStr}.`,
                            sources: [{ category: 'db_meta', snippet: `Location: ${locStr}, Date: ${dateStr}` }]
                        };
                    }
                }

                // Otherwise, search Docs/Meta Embeddings
                console.log("   🔍 Searching Event Info Embeddings...");
                const embedding = await EmbeddingService.generateEmbedding(question);
                const [meta, doc] = await Promise.all([
                    SupabaseService.searchEventEmbeddings(embedding, eventId, 'meta', 3, 0.45),
                    SupabaseService.searchEventEmbeddings(embedding, eventId, 'doc', 5, 0.45)
                ]);

                const matches = [...meta, ...doc];
                if (matches.length === 0) {
                    return { answer: "This information is not available.", sources: [] };
                }

                sources = matches;
                contextText = matches.map(m => `[${m.category.toUpperCase()}] ${m.chunks}`).join("\n\n");
            }

            // 3. GENERATE ANSWER (If not returned early)
            const systemInstruction = `
You are a strict Event Assistant.
Context is retrieved based on intent: ${intent}.

GUIDELINES:
1. Answer using ONLY the provided Context.
2. Do NOT hallucinate. If info is missing, say "I don't know".
3. Do not infer external knowledge.
4. Keep answers concise.
5. Do not reveal IDs.

CONTEXT:
${contextText}
`;

            console.log("   Brain: Thinking (Gemini)...");
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp",
                systemInstruction: systemInstruction
            });

            const result = await model.generateContent(`QUESTION: ${question}`);
            const answer = result.response.text().trim();

            return {
                answer: answer,
                sources: sources.slice(0, 3).map(m => ({
                    category: m.category,
                    snippet: m.chunks.substring(0, 50) + "..."
                }))
            };

        } catch (error) {
            console.error("❌ [ASSISTANT] Error:", error);
            return { answer: "I encountered an error.", sources: [] };
        }
    }
}
