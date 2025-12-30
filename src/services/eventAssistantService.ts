import Groq from "groq-sdk";
import config from "../config";

const groq = new Groq({ apiKey: config.groqApiKey });

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
     * Event Assistant Chatbot using Groq (Llama 3)
     */
    askEventAssistant: async (
        question: string,
        event: any,
        userProfile: any,
        conversationHistory: any[] = []
    ): Promise<EventAssistantResponse> => {
        try {
            console.log(`🤖 Groq Assistant: Processing question about "${event.name}"`);

            // Build context
            const eventContext = `
EVENT DETAILS:
- Name: ${event.name}
- Headline: ${event.headline || 'N/A'}
- Description: ${event.description}
- Date: ${event.dateTime}
- Location: ${event.location}
- Tags: ${event.tags?.join(', ') || 'None'}
${event.pdfExtractedText ? `- Extra Content: ${event.pdfExtractedText}` : ''}

USER PROFILE:
- Name: ${userProfile.name}
- Role: ${userProfile.role || 'N/A'}
- Interests: ${userProfile.interests?.join(', ') || 'N/A'}
- Goal: ${userProfile.primaryGoal || 'N/A'}
`;

            const historyText = conversationHistory
                .map(msg => `${msg.role.toUpperCase()}: ${msg.content}`)
                .join('\n');

            const systemPrompt = `You are an intelligent Event Assistant. 
Answer the user's question based strictly on the provided EVENT DETAILS and USER PROFILE.
Be helpful, concise, and professional.

Return ONLY a JSON object in this format:
{
  "answer": "Your answer string here",
  "relevantInfo": ["Key point 1", "Key point 2"],
  "confidence": 85
}
Do not include markdown formatting (like \`\`\`json) outside the JSON.`;

            if (!config.groqApiKey) {
                console.error("❌ Groq API Key is missing in config!");
            } else {
                console.log(`🔑 Using Groq API Key: ...${config.groqApiKey.slice(-4)}`);
            }

            const completion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `CONTEXT:\n${eventContext}\n\nHISTORY:\n${historyText}\n\nQUESTION: ${question}` }
                ],
                model: "llama-3.3-70b-versatile", // Latest stable model
                temperature: 0.5,
                max_tokens: 1024,
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0]?.message?.content || "{}";
            const response = JSON.parse(content);

            console.log(`✅ Groq Answer: ${response.answer?.substring(0, 50)}...`);

            return {
                answer: response.answer || "I couldn't generate an answer based on the event details.",
                relevantInfo: response.relevantInfo || [],
                confidence: response.confidence || 50
            };

        } catch (error: any) {
            console.error("❌ Groq Error:", error);
            return {
                answer: "I'm having trouble connecting to the event assistant right now. Please try again later.",
                relevantInfo: [],
                confidence: 0
            };
        }
    },

    getSuggestedQuestions: (_event: any, _userProfile: any): string[] => {
        return [
            "What is the main agenda?",
            "Who is this event for?",
            "Is there a networking session?",
            "What should I bring?"
        ];
    }
};
