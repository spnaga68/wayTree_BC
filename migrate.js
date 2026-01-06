
const mongoose = require('mongoose');

// Extracted from your .env
const uri = "mongodb+srv://22it039_db_user:Sk2BGFUdIPOdnxQl@cluster0.bwngvo4.mongodb.net/test?appName=Cluster0";

async function run() {
    try {
        await mongoose.connect(uri);
        console.log('Connected.');

        const sourceId = "6956666a201993ec1dc1b2aa";
        const targetId = "6956d796d4d83d2af56de398";

        const db = mongoose.connection.db;
        const collection = db.collection('eventmembers');

        const sourceObj = new mongoose.Types.ObjectId(sourceId);
        const targetObj = new mongoose.Types.ObjectId(targetId);

        // Try Object IDs
        const res1 = await collection.updateMany(
            { eventId: sourceObj },
            { $set: { eventId: targetObj } }
        );
        console.log('OBJ UPDATED:', res1.modifiedCount);

        // Try String IDs
        const res2 = await collection.updateMany(
            { eventId: sourceId },
            { $set: { eventId: targetObj } }
        );
        console.log('STRING UPDATED:', res2.modifiedCount);

        // Verify result
        const finalCount = await collection.countDocuments({ eventId: targetObj });
        console.log('FINAL TARGET COUNT:', finalCount);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

run();
