
import mongoose from 'mongoose';
import config from './src/config';

async function migrate() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('Connected to DB:', mongoose.connection.name);

        const sourceId = "6956666a201993ec1dc1b2aa";
        const targetId = "6956d796d4d83d2af56de398";

        const db = mongoose.connection.db;
        const collection = db.collection('eventmembers');

        // Check if source exists
        const sourceCount = await collection.countDocuments({
            eventId: new mongoose.Types.ObjectId(sourceId)
        });
        console.log(`Source event ${sourceId} has ${sourceCount} members.`);

        if (sourceCount > 0) {
            const result = await collection.updateMany(
                { eventId: new mongoose.Types.ObjectId(sourceId) },
                { $set: { eventId: new mongoose.Types.ObjectId(targetId) } }
            );
            console.log(`Migrated ${result.modifiedCount} members to ${targetId}.`);
        } else {
            // Check string ID just in case
            const sourceStrCount = await collection.countDocuments({ eventId: sourceId });
            console.log(`Source event ${sourceId} (string) has ${sourceStrCount} members.`);
            if (sourceStrCount > 0) {
                const result = await collection.updateMany(
                    { eventId: sourceId },
                    { $set: { eventId: new mongoose.Types.ObjectId(targetId) } }
                );
                console.log(`Migrated ${result.modifiedCount} string-members to ${targetId}.`);
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

migrate();
