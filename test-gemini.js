
const { GoogleGenerativeAI } = require("@google/generative-ai");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, '.env') });

const apiKey = process.env.GEMINI_API_KEY;

console.log("🔑 Checking API Key:", apiKey ? "FOUND" : "MISSING");

async function checkModels() {
    if (!apiKey) {
        console.error("❌ No API Key found in .env");
        return;
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // 1. Test Embedding
    process.stdout.write(`   Testing 'text-embedding-004' (Embedding)... `);
    try {
        const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
        await model.embedContent("Hello");
        console.log(`✅ WORKED`);
    } catch (e) {
        console.log(`❌ FAILED: ${e.message}`);
    }

    // 2. Test Gemini 2.0 & Requested Models
    const models = [
        'gemini-2.0-flash-exp',    // Current public preview
        'gemini-2.0-flash',        // User requested
        'gemini-2.5-flash',        // User requested
        'gemini-exp-1206',         // Recent experimental
        'gemini-exp-1121'          // Older experimental
    ];

    console.log("\n🧪 Testing Gemini 2.0 & Experimental Models...");

    for (const modelName of models) {
        process.stdout.write(`   Testing '${modelName}'... `);
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hi");
            const response = await result.response;
            await response.text();
            console.log(`✅ WORKED`);
        } catch (error) {
            console.log(`❌ ${error.message.split('\n')[0]}`);
        }
    }
}

checkModels();
