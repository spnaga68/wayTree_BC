require('dotenv').config();
const mongoose = require('mongoose');

async function checkUserData() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Get the User model
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));

        // Find the user with email n3@gmail.com
        const user = await User.findOne({ email: 'n3@gmail.com' });

        if (user) {
            console.log('✅ User found in MongoDB:');
            console.log(JSON.stringify(user, null, 2));
        } else {
            console.log('❌ User NOT found in MongoDB');
        }

        // List all users
        const allUsers = await User.find({});
        console.log(`\n📊 Total users in database: ${allUsers.length}`);

        await mongoose.connection.close();
        console.log('\n✅ Connection closed');
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkUserData();
