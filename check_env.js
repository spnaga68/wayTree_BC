require('dotenv').config();

console.log('='.repeat(80));
console.log('ENVIRONMENT VARIABLES CHECK');
console.log('='.repeat(80));
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('MONGODB_URI length:', process.env.MONGODB_URI ? process.env.MONGODB_URI.length : 0);
console.log('MONGODB_URI type:', typeof process.env.MONGODB_URI);
console.log('First 20 chars:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) : 'N/A');
console.log('='.repeat(80));
