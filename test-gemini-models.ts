
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import path from "path";

// Load .env from correct path
dotenv.config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;

console.log("🔑 Checking API Key:", apiKey ? "FOUND" : "MISSING");

async function checkModels() {
    if (!apiKey) {
        console.error("❌ No API Key found in .env");
        return;
    }

    try {
        console.log("🌐 Connecting to Google Generative AI...");
        // Hack: Use any model to get client, then listModels is on the class usually or client
        // Wait, listModels is not directly exposed on GoogleGenerativeAI instance in older SDKs?
        // Let's try the standard way if SDK supports it.
        // Actually, in the official Node SDK, it's NOT straightforward to list models via the helper class.
        // But we can try a simple generation with different model names to see which succeeds.

        const models = [
            'gemini-pro',
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-1.0-pro',
            'gemini-1.5-flash-latest'
        ];

        console.log("\n🧪 Testing Models...");

        for (const modelName of models) {
            process.stdout.write(`   Testing '${modelName}'... `);
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: modelName });

            try {
                const result = await model.generateContent("Hello, are you there?");
                const response = await result.response;
                const text = response.text();
                // If we get here, it worked
                console.log(`✅ WORKED!`);
            } catch (error: any) {
                if (error.message.includes('404')) {
                    console.log(`❌ NOT FOUND (404)`);
                } else {
                    console.log(`❌ ERROR: ${error.message.split('\n')[0]}`);
                }
            }
        }

    } catch (error) {
        console.error("❌ Fatal Error:", error);
    }
}

checkModels();
