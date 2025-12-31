
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI || "";

async function checkUsers() {
    try {
        await mongoose.connect(uri);
        console.log("Connected to DB:", uri);

        // Explicitly check the 'users' collection for the specific email
        const users = await mongoose.connection.collection('users').find({ email: "n1@gmail.com" }).toArray();

        console.log(`Found ${users.length} users with email 'n1@gmail.com':`);
        users.forEach((u: any) => {
            console.log(`- ${u.name} (${u.email}) [${u._id}]`);
        });

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

checkUsers();
