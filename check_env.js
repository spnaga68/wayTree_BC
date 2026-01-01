require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('\n=== COMPREHENSIVE ENVIRONMENT CHECK ===\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
console.log('.env file path:', envPath);
console.log('.env file exists:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
    console.log('.env file size:', fs.statSync(envPath).size, 'bytes');

    // Read and parse .env file manually
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');

    console.log('\n--- Lines containing MONGO (case-insensitive) ---');
    lines.forEach((line, index) => {
        if (line.toUpperCase().includes('MONGO')) {
            console.log(`Line ${index + 1}: "${line}"`);
            console.log(`  - Length: ${line.length}`);
            console.log(`  - Starts with space: ${line[0] === ' '}`);
            console.log(`  - Contains =: ${line.includes('=')}`);
            if (line.includes('=')) {
                const [key, ...valueParts] = line.split('=');
                const value = valueParts.join('=');
                console.log(`  - Key: "${key.trim()}"`);
                console.log(`  - Value length: ${value.length}`);
                console.log(`  - Value starts with: "${value.substring(0, 20)}"`);
            }
        }
    });
}

console.log('\n--- All environment variables with MONGO ---');
Object.keys(process.env).forEach(key => {
    if (key.toUpperCase().includes('MONGO')) {
        console.log(`${key}:`, process.env[key]?.substring(0, 50) || '(empty)');
    }
});

console.log('\n--- Specific checks ---');
console.log('process.env.MONGODB_URI:', process.env.MONGODB_URI || '(not set)');
console.log('process.env.MONGO_URI:', process.env.MONGO_URI || '(not set)');
console.log('process.env.DATABASE_URL:', process.env.DATABASE_URL || '(not set)');

console.log('\n=== END CHECK ===\n');
