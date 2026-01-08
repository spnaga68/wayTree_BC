
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const runTest = async () => {
    console.log("🧪 Testing Gemini API Key...");

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing in .env file");
        return;
    }

    console.log(`🔑 Key found: ${apiKey.substring(0, 5)}...`);

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        // List of models to test
        const modelsToTest = [
            { name: "gemini-1.5-flash", type: "generate" },
            { name: "gemini-1.5-flash-001", type: "generate" },
            { name: "gemini-1.5-flash-8b", type: "generate" }, // Sometimes 8b
            { name: "gemini-1.5-pro", type: "generate" },
            { name: "gemini-1.0-pro", type: "generate" },
            { name: "gemini-2.0-flash-exp", type: "generate" }, // Experimental
            { name: "text-embedding-004", type: "embed" }
        ];

        console.log("📋 Checking Model Availability...");

        for (const m of modelsToTest) {
            console.log(`\n🔍 Testing: ${m.name}...`);
            try {
                const model = genAI.getGenerativeModel({ model: m.name });

                if (m.type === "generate") {
                    const result = await model.generateContent("Hello");
                    const response = await result.response;
                    console.log(`   ✅ SUCCESS! Response: "${response.text().trim()}"`);
                } else {
                    const result = await model.embedContent("Hello");
                    if (result.embedding) {
                        console.log(`   ✅ SUCCESS! Embedding dimensions: ${result.embedding.values.length}`);
                    }
                }
            } catch (e: any) {
                if (e.message && e.message.includes("404")) {
                    console.log(`   ❌ Not Found (404) - Model not available to this key/version.`);
                } else if (e.message && e.message.includes("429")) {
                    console.log(`   🔴 Quota Exceeded (429) - Model available but limit reached.`);
                } else {
                    console.log(`   ❌ Error: ${e.message}`);
                }
            }
        }

        console.log("\n🏁 Availability Check Complete.");

    } catch (error: any) {
        console.error("\n❌ API Test Failed:");
        if (error.status === 429) {
            console.error("🔴 QUOTA EXCEEDED (429). You have hit your rate limit.");
        } else {
            console.error(error.message || error);
        }
    }
};

runTest();
