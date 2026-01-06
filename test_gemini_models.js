require('dotenv').config();
const https = require('https');

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey) {
    console.error("❌ GEMINI_API_KEY is missing from .env file");
    process.exit(1);
}

console.log("🔑 Using API Key ending in:", apiKey.slice(-4));
console.log("📡 Fetching available Gemini models...");

const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

https.get(url, (res) => {
    let data = '';

    res.on('data', (chunk) => {
        data += chunk;
    });

    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            if (response.models) {
                console.log("\n✅ AVAILABLE MODELS:");
                console.log("----------------------------------------");
                response.models.forEach(model => {
                    const methods = model.supportedGenerationMethods ? model.supportedGenerationMethods.join(', ') : 'Unknown';
                    // We only care about generateContent models
                    if (methods.includes('generateContent')) {
                        console.log(`Model: ${model.name}`);
                        console.log(`Methods: ${methods}`);
                        console.log("----------------------------------------");
                    }
                });
            } else {
                console.error("\n❌ Error fetching models:", response);
            }
        } catch (e) {
            console.error("\n❌ JSON Parse Error:", e);
            console.log("Raw Response:", data);
        }
    });

}).on('error', (err) => {
    console.error("\n❌ Request Error:", err.message);
});
